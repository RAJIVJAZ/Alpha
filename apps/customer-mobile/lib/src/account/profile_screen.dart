import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:foodgrid_core/foodgrid_core.dart';

import '../common/widgets.dart';
import 'models.dart';
import 'profile.dart';

/// Name and email (GET/PATCH users/me) and the invite code.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: AsyncView<Profile>(value: profile, onRetry: () => ref.invalidate(profileProvider), data: (p) => _ProfileForm(profile: p)),
    );
  }
}

class _ProfileForm extends ConsumerStatefulWidget {
  const _ProfileForm({required this.profile});
  final Profile profile;

  @override
  ConsumerState<_ProfileForm> createState() => _ProfileFormState();
}

class _ProfileFormState extends ConsumerState<_ProfileForm> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.profile.name);
  late final _email = TextEditingController(text: widget.profile.email);
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    try {
      final email = _email.text.trim();
      final res = await ref.read(apiClientProvider).patch<dynamic>('users/me', body: {'name': _name.text.trim(), 'email': ?(email.isEmpty ? null : email)});
      ref.invalidate(profileProvider);
      // a new email is stored only once the code sent to it is entered
      final pending = res is Map ? res['emailVerification'] as Map? : null;
      if (pending == null) {
        if (mounted) showMessage(context, 'Profile saved');
      } else if (mounted && await _confirmEmail(pending) == true) {
        ref.invalidate(profileProvider);
        if (mounted) showMessage(context, 'Email confirmed');
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool?> _confirmEmail(Map pending) => showDialog<bool>(
        context: context,
        builder: (_) => _EmailCodeDialog(email: '${pending['pendingEmail']}', devCode: pending['devCode'] as String?),
      );

  @override
  Widget build(BuildContext context) {
    final p = widget.profile;
    final text = Theme.of(context).textTheme;
    return Form(
      key: _form,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.phone_outlined), title: const Text('Mobile number'), subtitle: Text(p.phone ?? '—')),
        const SizedBox(height: 8),
        TextFormField(
          controller: _name,
          maxLength: 80,
          autofillHints: const [AutofillHints.name],
          decoration: const InputDecoration(labelText: 'Name'),
          validator: (v) => (v ?? '').trim().isEmpty ? 'Tell us your name' : null,
        ),
        TextFormField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          decoration: const InputDecoration(labelText: 'Email (for receipts)'),
          validator: (v) => (v ?? '').trim().isEmpty || RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v!.trim()) ? null : 'Enter a valid email',
        ),
        const SizedBox(height: 20),
        FilledButton(onPressed: _busy ? null : _save, child: _busy ? const ButtonSpinner() : const Text('Save')),
        if (p.referralCode != null) ...[
          const SizedBox(height: 24),
          Card(
            child: ListTile(
              leading: const Icon(Icons.card_giftcard),
              title: const Text('Your invite code'),
              subtitle: Text(p.referralCode!, style: text.titleMedium?.copyWith(fontFamily: 'monospace', fontWeight: FontWeight.w700)),
              trailing: IconButton(
                tooltip: 'Copy invite code',
                icon: const Icon(Icons.copy),
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: p.referralCode!));
                  if (context.mounted) showMessage(context, 'Invite code copied');
                },
              ),
            ),
          ),
        ],
      ]),
    );
  }
}

class _EmailCodeDialog extends ConsumerStatefulWidget {
  const _EmailCodeDialog({required this.email, this.devCode});
  final String email;
  final String? devCode;

  @override
  ConsumerState<_EmailCodeDialog> createState() => _EmailCodeDialogState();
}

class _EmailCodeDialogState extends ConsumerState<_EmailCodeDialog> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    setState(() => (_busy = true, _error = null));
    try {
      await ref.read(apiClientProvider).post<dynamic>('users/me/email/verify', body: {'code': _code.text.trim()});
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => (_busy = false, _error = e.toString()));
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Confirm your email'),
        content: TextField(
          controller: _code,
          autofocus: true,
          keyboardType: TextInputType.number,
          maxLength: 6,
          autofillHints: const [AutofillHints.oneTimeCode],
          decoration: InputDecoration(
            labelText: 'Code sent to ${widget.email}',
            helperText: widget.devCode == null ? null : 'Development code: ${widget.devCode}',
            errorText: _error,
          ),
          onSubmitted: (_) => _verify(),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Later')),
          FilledButton(onPressed: _busy ? null : _verify, child: const Text('Confirm')),
        ],
      );
}
