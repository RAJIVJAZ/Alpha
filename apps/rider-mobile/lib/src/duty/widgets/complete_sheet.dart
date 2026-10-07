import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../../common/device.dart';
import '../../common/errors.dart';
import '../../common/widgets.dart';
import '../duty_repository.dart';
import '../location_tracker.dart';
import '../models.dart';

/// Proof of delivery: the customer's 4-digit code, or a photo at the door, and
/// confirmation that COD cash was collected. Pops `true` once delivered.
class CompleteSheet extends ConsumerStatefulWidget {
  const CompleteSheet({super.key, required this.delivery});
  final Delivery delivery;

  @override
  ConsumerState<CompleteSheet> createState() => _CompleteSheetState();
}

class _CompleteSheetState extends ConsumerState<CompleteSheet> {
  final _otp = TextEditingController();
  PickedPhoto? _photo;
  bool _cash = false;
  bool _busy = false;
  String? _stage;
  String? _error;

  Delivery get d => widget.delivery;

  bool get _hasProof => _otp.text.length == 4 || _photo != null;
  bool get _ready => _hasProof && (!d.isCod || _cash) && !_busy;

  @override
  void dispose() {
    _otp.dispose();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    try {
      final photo = await ref.read(photoTakerProvider)();
      if (photo != null && mounted) setState(() => (_photo = photo, _error = null));
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not open the camera: $e');
    }
  }

  Future<void> _submit() async {
    if (!_ready) return;
    final container = ProviderScope.containerOf(context, listen: false);
    setState(() => (_busy = true, _error = null, _stage = 'Checking your location…'));
    try {
      // completion is geofenced: make sure the server has where the rider is now
      await container.read(locationTrackerProvider.notifier).pingNow();
      String? photoUrl;
      final photo = _photo;
      if (photo != null) {
        if (mounted) setState(() => _stage = 'Uploading photo…');
        photoUrl = await uploadMedia(
          container.read(apiClientProvider),
          folder: MediaFolder.deliveryProof,
          bytes: photo.bytes,
          fileName: photo.fileName,
          contentType: photo.contentType,
        );
      }
      if (mounted) setState(() => _stage = 'Completing…');
      final otp = _otp.text.trim();
      await container.read(dutyRepositoryProvider).complete(
            d.id,
            otp: otp.length == 4 ? otp : null,
            proofPhotoUrl: photoUrl,
            codCollected: d.isCod ? _cash : null,
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = riderMessage(e));
    } finally {
      if (mounted) setState(() => (_busy = false, _stage = null));
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Complete ${d.orderNumber}', style: text.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          const Caption('Ask the customer for the 4-digit code in their app. For contact-less drops, take a photo of the order at the door instead.'),
          const SizedBox(height: 16),
          TextField(
            key: const ValueKey('otp-field'),
            controller: _otp,
            enabled: !_busy,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
            textAlign: TextAlign.center,
            style: text.headlineMedium?.copyWith(letterSpacing: 16, fontWeight: FontWeight.w600),
            decoration: const InputDecoration(labelText: 'Delivery code', hintText: '••••', isDense: false),
            onChanged: (_) => setState(() => _error = null),
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: 12),
          Row(children: [
            const Expanded(child: Divider()),
            Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Caption('or')),
            const Expanded(child: Divider()),
          ]),
          const SizedBox(height: 12),
          SizedBox(
            height: 52,
            child: OutlinedButton.icon(
              onPressed: _busy ? null : _takePhoto,
              icon: const Icon(Icons.photo_camera_outlined),
              label: Text(_photo == null ? 'Take a proof photo' : 'Retake photo'),
            ),
          ),
          if (_photo != null) ...[
            const SizedBox(height: 8),
            Row(children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.memory(_photo!.bytes, width: 56, height: 56, fit: BoxFit.cover, semanticLabel: 'Proof photo', errorBuilder: (_, _, _) => const Icon(Icons.image_outlined, size: 40)),
              ),
              const SizedBox(width: 10),
              Expanded(child: Text('Photo ready · ${_photo!.fileName}', overflow: TextOverflow.ellipsis)),
              IconButton(tooltip: 'Remove photo', onPressed: _busy ? null : () => setState(() => _photo = null), icon: const Icon(Icons.delete_outline)),
            ]),
          ],
          if (d.isCod) ...[
            const SizedBox(height: 12),
            DecoratedBox(
              decoration: BoxDecoration(border: Border.all(color: scheme.outlineVariant), borderRadius: BorderRadius.circular(10)),
              child: CheckboxListTile(
                value: _cash,
                onChanged: _busy ? null : (v) => setState(() => _cash = v ?? false),
                controlAffinity: ListTileControlAffinity.leading,
                title: Text('I collected ${money(d.codAmount)} in cash'),
                subtitle: const Text('Cash on delivery'),
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Semantics(
              liveRegion: true,
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: scheme.errorContainer, borderRadius: BorderRadius.circular(10)),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(Icons.error_outline, color: scheme.onErrorContainer),
                  const SizedBox(width: 10),
                  Expanded(child: Text(_error!, style: TextStyle(color: scheme.onErrorContainer))),
                ]),
              ),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            height: 60,
            child: FilledButton.icon(
              onPressed: _ready ? _submit : null,
              icon: _busy ? const ButtonSpinner(color: Colors.white) : const Icon(Icons.check),
              label: Text(_busy ? (_stage ?? 'Completing…') : 'Mark delivered'),
            ),
          ),
          if (!_hasProof)
            const Padding(padding: EdgeInsets.only(top: 6), child: Caption('Enter the code or take a photo to continue.')),
        ]),
      ),
    );
  }
}
