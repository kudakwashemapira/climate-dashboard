import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/climate_api.dart';
import '../log.dart';
import '../theme.dart';

/// The strength rules of the server (backend AUTH_PASSWORD_VALIDATORS), in words.
const passwordRules = 'At least 10 characters, not only digits, not a common password, and not close to your name or email.';

String? _againCheck(String? again, String password) => again == password ? null : 'The two entries are not the same.';

/// Change your own password: POST /api/users/me/password/ with the current one. This sign-in goes on
/// with the new tokens; every other sign-in of the account ends. Pops with the server's message.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key, required this.api});

  final ClimateApi api;

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _password = TextEditingController();
  final _again = TextEditingController();
  Map<String, List<String>> _fields = const {};
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_current, _password, _again]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _server(String field) => _fields[field]?.join(' ');

  Future<void> _save() async {
    setState(() {
      _fields = const {};
      _error = null;
    });
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final message = await widget.api.changePassword(current: _current.text, next: _password.text);
      appLog('auth', 'password changed; other sign-ins ended');
      if (mounted) Navigator.of(context).pop(message);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _fields = error.fields;
        _error = error.fields.isEmpty ? error.message : null;
      });
      _form.currentState!.validate();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tones = Tones.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Change password')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'You stay signed in here. Every other sign-in of your account ends, and you get an email that the password was changed.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 20),
            TextFormField(
              controller: _current,
              obscureText: true,
              autofillHints: const [AutofillHints.password],
              decoration: const InputDecoration(labelText: 'Current password', prefixIcon: Icon(Icons.lock_outline)),
              validator: (v) => (v ?? '').isEmpty ? 'Enter your current password.' : _server('current_password'),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _password,
              obscureText: true,
              autofillHints: const [AutofillHints.newPassword],
              decoration: const InputDecoration(
                labelText: 'New password',
                helperText: passwordRules,
                helperMaxLines: 3,
                prefixIcon: Icon(Icons.key),
              ),
              validator: (v) => (v ?? '').length < 10 ? 'Use at least 10 characters.' : _server('new_password'),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _again,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'New password again', prefixIcon: Icon(Icons.key)),
              validator: (v) => _againCheck(v, _password.text),
            ),
            if (_error != null) ...[const SizedBox(height: 16), Text(_error!, style: TextStyle(color: tones.crit.color))],
            const SizedBox(height: 22),
            FilledButton.icon(
              onPressed: _busy ? null : _save,
              icon: _busy
                  ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.save_outlined),
              label: const Text('Change password'),
            ),
          ],
        ),
      ),
    );
  }
}

/// "Forgot your password?" from the sign-in page: the email, then the emailed code and a new password
/// (POST /api/users/password-reset/ and /confirm/). The server answers the first step the same way for
/// every address, so the screen never says whether an account exists.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, required this.api, this.email = ''});

  final ClimateApi api;
  final String email;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _form = GlobalKey<FormState>();
  late final _email = TextEditingController(text: widget.email);
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _again = TextEditingController();
  bool _codeStep = false;
  bool _done = false;
  bool _busy = false;
  String? _notice;
  String? _error;
  Map<String, List<String>> _fields = const {};

  @override
  void dispose() {
    for (final c in [_email, _code, _password, _again]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _server(String field) => _fields[field]?.join(' ');

  Future<void> _run(Future<void> Function() step) async {
    setState(() {
      _fields = const {};
      _error = null;
    });
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await step();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _fields = error.fields;
        _error = error.fields.isEmpty ? error.message : null;
      });
      _form.currentState!.validate();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendCode() => _run(() async {
    final message = await widget.api.requestPasswordReset(_email.text);
    appLog('auth', 'password reset code requested');
    if (mounted) {
      setState(() {
        _codeStep = true;
        _notice = message;
        _code.clear();
      });
    }
  });

  Future<void> _confirm() => _run(() async {
    await widget.api.confirmPasswordReset(email: _email.text, code: _code.text, newPassword: _password.text);
    appLog('auth', 'password reset; earlier sign-ins ended');
    if (mounted) setState(() => _done = true);
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tones = Tones.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(_done ? 'Password changed' : 'Reset your password')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_done) ...[
              Icon(Icons.check_circle_outline, size: 48, color: tones.good.color),
              const SizedBox(height: 12),
              Text(
                'Your password was changed. Every earlier sign-in of your account has ended. Sign in with the new password.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge,
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.login),
                label: const Text('Back to sign in'),
              ),
            ] else if (!_codeStep) ...[
              Text('Enter the email address of your account. A 6-digit reset code is sent to it.', style: theme.textTheme.bodyMedium),
              const SizedBox(height: 20),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.alternate_email)),
                validator: (v) => (v ?? '').contains('@') ? _server('email') : 'Enter your email address.',
              ),
              if (_error != null) ...[const SizedBox(height: 16), Text(_error!, style: TextStyle(color: tones.crit.color))],
              const SizedBox(height: 22),
              FilledButton.icon(
                onPressed: _busy ? null : _sendCode,
                icon: const Icon(Icons.mark_email_read_outlined),
                label: const Text('Send me a reset code'),
              ),
            ] else ...[
              if (_notice != null) Text(_notice!, style: theme.textTheme.bodyMedium?.copyWith(color: tones.good.color)),
              const SizedBox(height: 16),
              TextFormField(
                controller: _code,
                keyboardType: TextInputType.number,
                autofillHints: const [AutofillHints.oneTimeCode],
                maxLength: 6,
                decoration: const InputDecoration(labelText: 'Reset code', counterText: '', prefixIcon: Icon(Icons.pin_outlined)),
                validator: (v) => RegExp(r'^\d{6}$').hasMatch((v ?? '').trim()) ? _server('code') : 'Enter the 6 digits from the email.',
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _password,
                obscureText: true,
                autofillHints: const [AutofillHints.newPassword],
                decoration: const InputDecoration(
                  labelText: 'New password',
                  helperText: passwordRules,
                  helperMaxLines: 3,
                  prefixIcon: Icon(Icons.key),
                ),
                validator: (v) => (v ?? '').length < 10 ? 'Use at least 10 characters.' : _server('new_password'),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _again,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'New password again', prefixIcon: Icon(Icons.key)),
                validator: (v) => _againCheck(v, _password.text),
              ),
              if (_error != null) ...[const SizedBox(height: 16), Text(_error!, style: TextStyle(color: tones.crit.color))],
              const SizedBox(height: 22),
              FilledButton.icon(onPressed: _busy ? null : _confirm, icon: const Icon(Icons.key), label: const Text('Set the new password')),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(onPressed: _busy ? null : _sendCode, child: const Text('Send a new code')),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// A message from the server, for a snackbar after a password screen closes.
void showServerMessage(BuildContext context, String? message) {
  if (message == null || message.isEmpty) return;
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
