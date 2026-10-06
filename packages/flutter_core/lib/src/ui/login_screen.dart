import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../auth/claims.dart';
import '../providers.dart';

enum LoginMode { otp, password }

/// Sign-in used by every FoodGrid app: phone OTP, optionally email + password
/// (merchant staff) and "Continue with Google" when a server client id is set.
///
/// [authorize] decides whether this app accepts the account; returning a
/// message signs the user straight back out and shows it.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, required this.title, this.subtitle, this.modes = const [LoginMode.otp], this.allowGoogle = false, this.authorize});

  final String title;
  final String? subtitle;
  final List<LoginMode> modes;
  final bool allowGoogle;
  final String? Function(Claims claims)? authorize;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  late LoginMode _mode = widget.modes.first;
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;
  String? _sentTo;
  String? _devCode;
  int _resendIn = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    for (final c in [_phone, _code, _email, _password]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _run(Future<void> Function() fn) async {
    setState(() => (_busy = true, _error = null));
    try {
      await fn();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _finish(Claims claims) async {
    final verdict = widget.authorize?.call(claims);
    if (verdict != null) {
      await ref.read(authRepositoryProvider).logout();
      throw LoginFailure(verdict);
    }
    await ref.read(sessionProvider.notifier).reload();
  }

  Future<void> _sendCode() => _run(() async {
        final c = await ref.read(authRepositoryProvider).requestOtp(_phone.text);
        _timer?.cancel();
        setState(() => (_sentTo = c.maskedPhone, _devCode = c.devCode, _resendIn = c.resendAfter.inSeconds));
        _timer = Timer.periodic(const Duration(seconds: 1), (t) {
          if (!mounted || _resendIn <= 0) return t.cancel();
          setState(() => _resendIn--);
        });
      });

  Future<void> _verify() => _run(() async => _finish(await ref.read(authRepositoryProvider).verifyOtp(_phone.text, _code.text.trim())));

  Future<void> _passwordLogin() => _run(() async => _finish(await ref.read(authRepositoryProvider).loginWithPassword(_email.text, _password.text)));

  Future<void> _google() => _run(() async {
        final serverClientId = ref.read(appConfigProvider).googleServerClientId;
        final google = GoogleSignIn.instance;
        await google.initialize(serverClientId: serverClientId);
        final account = await google.authenticate();
        final idToken = account.authentication.idToken;
        if (idToken == null) throw const LoginFailure('Google did not return an ID token');
        await _finish(await ref.read(authRepositoryProvider).loginWithGoogle(idToken));
      });

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final google = widget.allowGoogle && ref.watch(appConfigProvider).googleServerClientId != null;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Container(
                    width: 52,
                    height: 52,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: Theme.of(context).colorScheme.primary, borderRadius: BorderRadius.circular(14)),
                    child: Text('FG', style: text.titleMedium?.copyWith(color: Theme.of(context).colorScheme.onPrimary, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(height: 20),
                  Text(widget.title, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
                  if (widget.subtitle != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(widget.subtitle!, style: text.bodyMedium)),
                  const SizedBox(height: 24),
                  if (widget.modes.length > 1)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: SegmentedButton<LoginMode>(
                        segments: const [
                          ButtonSegment(value: LoginMode.otp, label: Text('Mobile OTP')),
                          ButtonSegment(value: LoginMode.password, label: Text('Email')),
                        ],
                        selected: {_mode},
                        onSelectionChanged: (s) => setState(() => (_mode = s.first, _error = null)),
                      ),
                    ),
                  if (_mode == LoginMode.otp) ..._otpForm(text) else ..._passwordForm(),
                  if (google) ...[
                    const SizedBox(height: 16),
                    Row(children: const [Expanded(child: Divider()), Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('or')), Expanded(child: Divider())]),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(onPressed: _busy ? null : _google, icon: const Icon(Icons.account_circle_outlined), label: const Text('Continue with Google')),
                  ],
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Semantics(liveRegion: true, child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
                    ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _otpForm(TextTheme text) => _sentTo == null
      ? [
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumber],
            decoration: const InputDecoration(labelText: 'Mobile number', prefixText: '+91 ', hintText: '98765 43210', helperText: "We'll send a 6-digit code by SMS"),
            onSubmitted: (_) => _sendCode(),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _sendCode, child: _busy ? const _Spinner() : const Text('Send code')),
        ]
      : [
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            maxLength: 6,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(labelText: 'Code sent to $_sentTo', helperText: _devCode == null ? null : 'Development code: $_devCode'),
            onSubmitted: (_) => _verify(),
          ),
          const SizedBox(height: 8),
          FilledButton(onPressed: _busy ? null : _verify, child: _busy ? const _Spinner() : const Text('Verify and sign in')),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            TextButton(
              onPressed: () => setState(() {
                _sentTo = null;
                _code.clear();
              }),
              child: const Text('Change number'),
            ),
            TextButton(onPressed: _busy || _resendIn > 0 ? null : _sendCode, child: Text(_resendIn > 0 ? 'Resend in ${_resendIn}s' : 'Resend code')),
          ]),
        ];

  List<Widget> _passwordForm() => [
        TextField(controller: _email, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.username], decoration: const InputDecoration(labelText: 'Email')),
        const SizedBox(height: 12),
        TextField(controller: _password, obscureText: true, autofillHints: const [AutofillHints.password], decoration: const InputDecoration(labelText: 'Password'), onSubmitted: (_) => _passwordLogin()),
        const SizedBox(height: 16),
        FilledButton(onPressed: _busy ? null : _passwordLogin, child: _busy ? const _Spinner() : const Text('Sign in')),
      ];
}

class _Spinner extends StatelessWidget {
  const _Spinner();
  @override
  Widget build(BuildContext context) => const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2));
}

/// Convenience for app shells: sign out and clear the session.
Future<void> signOut(WidgetRef ref) => ref.read(sessionProvider.notifier).signOut();

/// Shown while the stored session is restored at launch.
class SplashView extends StatelessWidget {
  const SplashView({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: CircularProgressIndicator()));
}

/// A sign-in refused by the app or the identity provider, shown as-is.
class LoginFailure implements Exception {
  const LoginFailure(this.message);
  final String message;
  @override
  String toString() => message;
}
