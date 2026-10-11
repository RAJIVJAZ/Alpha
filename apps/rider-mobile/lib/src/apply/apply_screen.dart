import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/device.dart';
import '../common/errors.dart';
import '../common/json.dart';
import '../common/widgets.dart';
import '../duty/duty_repository.dart';
import '../profile/profile.dart';

/// The signed-in user's rider application (GET riders/me), or null before
/// they have applied.
final applicationProvider = FutureProvider.autoDispose<RiderProfile?>((ref) async {
  try {
    return await ref.watch(dutyRepositoryProvider).profile();
  } on ApiException catch (e) {
    if (e.status == 404) return null;
    rethrow;
  }
});

/// The server lets a rejected applicant, or one asked for changes, apply again.
bool canReapply(RiderProfile p) => p.status == 'REJECTED' || (p.status == 'PENDING_APPROVAL' && p.rejectionReason != null);

const vehicleTypes = {'BICYCLE': 'Bicycle', 'SCOOTER': 'Scooter', 'MOTORCYCLE': 'Motorcycle', 'EV_SCOOTER': 'Electric scooter'};
const documentLabels = {'ID_PROOF': 'ID proof (Aadhaar, PAN or voter ID)', 'DRIVING_LICENSE': 'Driving licence'};

/// Where a signed-in account without the RIDER role lands: apply to deliver,
/// then follow the review until approved.
class ApplyScreen extends ConsumerWidget {
  const ApplyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final application = ref.watch(applicationProvider);
    // a Google-only account has no number, and the server refuses it (PHONE_REQUIRED)
    final hasPhone = ref.watch(sessionProvider).value?.claims.phone != null;
    return Scaffold(
      appBar: AppBar(title: const Text('Deliver with FoodGrid'), actions: const [SignOutButton()]),
      body: AsyncView(
        value: application,
        onRetry: () => ref.invalidate(applicationProvider),
        data: (p) => ListView(padding: const EdgeInsets.all(16), children: [
          _Status(profile: p),
          if (p == null || canReapply(p)) ...[
            const SizedBox(height: 16),
            hasPhone ? ApplicationForm(previous: p) : const Notice(icon: Icons.phone_android, message: phoneRequiredMessage),
          ],
        ]),
      ),
    );
  }
}

class _Status extends ConsumerWidget {
  const _Status({required this.profile});
  final RiderProfile? profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final p = profile;
    if (p == null) {
      return const Notice(message: 'Tell us about yourself and your vehicle and add photos of your documents. We review every application and you can follow it here.');
    }
    final reason = p.rejectionReason;
    return switch (p.status) {
      'PENDING_APPROVAL' when reason != null =>
        Notice(icon: Icons.edit_note, color: scheme.tertiary, message: 'Changes requested: $reason\nUpdate your application below and submit it again.'),
      'PENDING_APPROVAL' => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Notice(icon: Icons.hourglass_top, message: 'Your application is under review. You will see the decision here.'),
          const SizedBox(height: 12),
          OutlinedButton.icon(onPressed: () => ref.invalidate(applicationProvider), icon: const Icon(Icons.refresh), label: const Text('Check status')),
        ]),
      'REJECTED' => Notice(icon: Icons.cancel_outlined, color: scheme.error, message: 'Your application was not approved: ${reason ?? 'no reason given'}\nYou can fix it and apply again below.'),
      'ACTIVE' => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Notice(icon: Icons.verified_outlined, message: 'You are approved as a FoodGrid delivery partner.'),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () async {
              // the approval added the RIDER role; a fresh token carries it and the router opens Duty
              await ref.read(apiClientProvider).refresh();
              await ref.read(sessionProvider.notifier).reload();
            },
            icon: const Icon(Icons.two_wheeler),
            label: const Text('Start delivering'),
          ),
        ]),
      _ => Notice(icon: Icons.block, color: scheme.error, message: 'Your rider account is ${humanize(p.status).toLowerCase()}. Contact FoodGrid support.'),
    };
  }
}

/// The POST riders/onboarding form; [previous] pre-fills a resubmission.
class ApplicationForm extends ConsumerStatefulWidget {
  const ApplicationForm({super.key, this.previous});
  final RiderProfile? previous;

  @override
  ConsumerState<ApplicationForm> createState() => _ApplicationFormState();
}

class _ApplicationFormState extends ConsumerState<ApplicationForm> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.previous?.name ?? ref.read(sessionProvider).value?.user.name);
  late final _city = TextEditingController(text: widget.previous?.city);
  late final _vehicleNumber = TextEditingController(text: widget.previous?.vehicleNumber);
  late final _licence = TextEditingController(text: widget.previous?.licenseNumber);
  late final _upi = TextEditingController(text: widget.previous?.upiId);
  late String _vehicle = vehicleTypes.containsKey(widget.previous?.vehicleType) ? widget.previous!.vehicleType! : 'SCOOTER';
  final _photos = <String, PickedPhoto>{};
  bool _busy = false;
  String? _error;

  bool get _motorised => _vehicle != 'BICYCLE';
  List<String> get _documents => ['ID_PROOF', if (_motorised) 'DRIVING_LICENSE'];

  @override
  void dispose() {
    for (final c in [_name, _city, _vehicleNumber, _licence, _upi]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _takePhoto(String kind) async {
    try {
      final photo = await ref.read(photoTakerProvider)();
      if (photo != null && mounted) setState(() => (_photos[kind] = photo, _error = null));
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not open the camera: $e');
    }
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    final previous = widget.previous?.documents ?? const {};
    final missing = _documents.where((k) => _photos[k] == null && previous[k] == null);
    if (missing.isNotEmpty) return setState(() => _error = 'Add a photo: ${documentLabels[missing.first]}.');
    setState(() => (_busy = true, _error = null));
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      final api = container.read(apiClientProvider);
      final documents = <Json>[
        for (final kind in _documents)
          {
            'kind': kind,
            'url': _photos[kind] == null
                ? previous[kind]
                : await uploadMedia(api, folder: MediaFolder.kyc, bytes: _photos[kind]!.bytes, fileName: _photos[kind]!.fileName, contentType: _photos[kind]!.contentType),
          },
      ];
      final upi = _upi.text.trim();
      await container.read(dutyRepositoryProvider).apply({
        'name': _name.text.trim(),
        'city': _city.text.trim(),
        'vehicleType': _vehicle,
        if (_motorised) 'vehicleNumber': vehicleNumber(_vehicleNumber.text),
        if (_motorised) 'licenseNumber': _licence.text.trim(),
        if (upi.isNotEmpty) 'upiId': upi,
        'documents': documents,
      });
      container.invalidate(applicationProvider);
    } catch (e) {
      if (mounted) setState(() => _error = riderMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final previous = widget.previous?.documents ?? const {};
    String? required(String? v) => (v ?? '').trim().isEmpty ? 'Required' : null;
    return Form(
      key: _form,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TextFormField(
          controller: _name,
          enabled: !_busy,
          decoration: const InputDecoration(labelText: 'Full name (as on your ID)'),
          textCapitalization: TextCapitalization.words,
          inputFormatters: [LengthLimitingTextInputFormatter(80)],
          validator: required,
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _city,
          enabled: !_busy,
          decoration: const InputDecoration(labelText: 'City you will deliver in'),
          textCapitalization: TextCapitalization.words,
          inputFormatters: [LengthLimitingTextInputFormatter(60)],
          validator: required,
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _vehicle,
          decoration: const InputDecoration(labelText: 'Vehicle'),
          items: [for (final e in vehicleTypes.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
          onChanged: _busy ? null : (v) => setState(() => _vehicle = v ?? _vehicle),
        ),
        if (_motorised) ...[
          const SizedBox(height: 12),
          TextFormField(
            controller: _vehicleNumber,
            enabled: !_busy,
            decoration: const InputDecoration(labelText: 'Vehicle number', hintText: 'KA01AB1234'),
            textCapitalization: TextCapitalization.characters,
            validator: (v) => required(v) ?? (isVehicleNumber(v!) ? null : 'Enter it like KA01AB1234'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _licence,
            enabled: !_busy,
            decoration: const InputDecoration(labelText: 'Driving licence number'),
            textCapitalization: TextCapitalization.characters,
            inputFormatters: [LengthLimitingTextInputFormatter(20)],
            validator: required,
          ),
        ],
        const SizedBox(height: 12),
        TextFormField(
          controller: _upi,
          enabled: !_busy,
          decoration: const InputDecoration(labelText: 'UPI ID for payouts (optional)', hintText: 'name@okaxis'),
          keyboardType: TextInputType.emailAddress,
          validator: (v) => (v ?? '').trim().isEmpty || RegExp(r'^[\w.-]+@\w+$').hasMatch(v!.trim()) ? null : 'Enter a UPI ID like name@okaxis',
        ),
        const SizedBox(height: 16),
        Text('Documents', style: Theme.of(context).textTheme.titleMedium),
        for (final kind in _documents)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(_photos[kind] != null || previous[kind] != null ? Icons.check_circle : Icons.badge_outlined, color: _photos[kind] != null || previous[kind] != null ? scheme.primary : null),
            title: Text(documentLabels[kind]!),
            subtitle: Text(_photos[kind] != null ? 'Photo ready' : (previous[kind] != null ? 'Sent earlier' : 'Photo needed')),
            trailing: OutlinedButton(
              onPressed: _busy ? null : () => _takePhoto(kind),
              child: Text(_photos[kind] != null || previous[kind] != null ? 'Retake' : 'Take photo'),
            ),
          ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Semantics(liveRegion: true, child: Notice(icon: Icons.error_outline, color: scheme.error, message: _error!)),
        ],
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _busy ? null : _submit,
          icon: _busy ? const ButtonSpinner(color: Colors.white) : const Icon(Icons.send),
          label: Text(_busy ? 'Submitting…' : (widget.previous == null ? 'Submit application' : 'Submit again')),
        ),
      ]),
    );
  }
}

/// "ka-01 ab 1234" → "KA01AB1234", the form the server checks.
String vehicleNumber(String input) => input.toUpperCase().replaceAll(RegExp(r'[\s-]'), '');

bool isVehicleNumber(String input) => RegExp(r'^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$').hasMatch(vehicleNumber(input));
