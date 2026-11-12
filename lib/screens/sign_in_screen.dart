import 'package:flutter/material.dart';

import '../api/climate_api.dart';
import '../api/models.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/product_mark.dart';
import '../widgets/zchpc.dart';
import 'password_screens.dart';

/// Sign-in (FR-019, FR-020), as on the web apps. A station account gives its station code, email and
/// password (POST /api/instauth/login/); a national account, a superadmin of DCCES, gives its email
/// and password only (POST /api/users/token/). Both then give the one-time code from the email
/// where the server asks for one.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.api, required this.onSignedIn});

  final ClimateApi api;
  final ValueChanged<User> onSignedIn;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _form = GlobalKey<FormState>();
  final _station = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();

  late final Future<ServerInfo> _server = widget.api.version();

  /// National sign-in: no station code, and the server's superadmin sign-in.
  bool _national = false;
  bool _codeStep = false;
  bool _busy = false;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    for (final controller in [_station, _email, _password, _code]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _submit({bool newCode = false}) async {
    if (!newCode && !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final otp = _codeStep && !newCode ? _code.text : null;
      final user = _national
          ? await widget.api.signInNational(email: _email.text, password: _password.text, otp: otp)
          : await widget.api.signIn(email: _email.text, password: _password.text, stationCode: _station.text, otp: otp);
      if (!mounted) return;
      if (user != null) return widget.onSignedIn(user);
      setState(() {
        _codeStep = true;
        _code.clear();
        if (newCode) _notice = 'A new code was sent. Earlier codes no longer work.';
      });
    } on Exception catch (error) {
      if (!mounted) return;
      final message = messageOf(error);
      // The server says only "Invalid credentials.": a station account at National, or a national one
      // at Station, is refused that way too, so the message names the other choice
      setState(
        () => _error = message != 'Invalid credentials.' || _codeStep
            ? message
            : _national
            ? 'The email or password is not right, or this is not a national account. A station account chooses Station above.'
            : 'The station code, email or password is not right. An account signs in only with the code of its own station; '
                  'a national administrator chooses National above.',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _choose(bool national) => setState(() {
    _national = national;
    _error = null;
    _notice = null;
  });

  void _back() => setState(() {
    _codeStep = false;
    _error = null;
    _notice = null;
    _code.clear();
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tones = Tones.of(context);
    // Android Back on the code step returns to the account step
    return PopScope(
      canPop: !_codeStep,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        body: FutureBuilder<ServerInfo>(
          future: _server,
          builder: (context, server) {
            final codeAsked = server.data?.signInCode ?? true; // worded for the stricter case until known
            return Form(
              key: _form,
              // A short form: one scrolling column builds every part, unlike a lazy list
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _BrandHeader(),
                    // The form card overlaps the brand band, as the web sign-in card sits beside its brand panel
                    Transform.translate(
                      offset: const Offset(0, -36),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Card(
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                if (!_codeStep) ...[
                                  SegmentedButton<bool>(
                                    segments: const [
                                      ButtonSegment(value: false, icon: Icon(Icons.location_city_outlined), label: Text('Station')),
                                      ButtonSegment(value: true, icon: Icon(Icons.public), label: Text('National')),
                                    ],
                                    selected: {_national},
                                    showSelectedIcon: false,
                                    onSelectionChanged: _busy ? null : (chosen) => _choose(chosen.first),
                                  ),
                                  const SizedBox(height: 18),
                                ],
                                Text(
                                  _codeStep
                                      ? 'Enter your one-time code'
                                      : _national
                                      ? 'Sign in to the national dashboard'
                                      : 'Sign in to your station',
                                  style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  _codeStep
                                      ? 'A 6-digit code was sent to ${_email.text.trim()}. It works once and expires after a few minutes.'
                                      : [
                                          _national
                                              ? 'For national administrators of DCCES: the figures of every station, no station code.'
                                              : 'Use the account your national administrator gave you.',
                                          if (codeAsked) 'A one-time code is then sent to your email.',
                                        ].join(' '),
                                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                                ),
                                const SizedBox(height: 20),
                                if (!_codeStep) ...[
                                  if (!_national) ...[
                                    TextFormField(
                                      controller: _station,
                                      decoration: const InputDecoration(
                                        labelText: 'Station code',
                                        hintText: 'HRE-001',
                                        helperText: 'The code of the station your account belongs to.',
                                        prefixIcon: Icon(Icons.location_city_outlined),
                                      ),
                                      textCapitalization: TextCapitalization.characters,
                                      textInputAction: TextInputAction.next,
                                      validator: (v) => (v ?? '').trim().isEmpty ? 'Enter the station code.' : null,
                                    ),
                                    const SizedBox(height: 16),
                                  ],
                                  AutofillGroup(
                                    child: Column(
                                      children: [
                                        TextFormField(
                                          controller: _email,
                                          decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.alternate_email)),
                                          keyboardType: TextInputType.emailAddress,
                                          autofillHints: const [AutofillHints.email],
                                          textInputAction: TextInputAction.next,
                                          validator: (v) => (v ?? '').contains('@') ? null : 'Enter your email address.',
                                        ),
                                        const SizedBox(height: 16),
                                        TextFormField(
                                          controller: _password,
                                          decoration: const InputDecoration(labelText: 'Password', prefixIcon: Icon(Icons.lock_outline)),
                                          obscureText: true,
                                          autofillHints: const [AutofillHints.password],
                                          onFieldSubmitted: (_) => _submit(),
                                          validator: (v) => (v ?? '').isEmpty ? 'Enter your password.' : null,
                                        ),
                                      ],
                                    ),
                                  ),
                                ] else
                                  TextFormField(
                                    controller: _code,
                                    decoration: const InputDecoration(
                                      labelText: 'One-time code',
                                      counterText: '',
                                      prefixIcon: Icon(Icons.pin_outlined),
                                    ),
                                    keyboardType: TextInputType.number,
                                    autofillHints: const [AutofillHints.oneTimeCode],
                                    maxLength: 6,
                                    autofocus: true,
                                    onFieldSubmitted: (_) => _submit(),
                                    validator: (v) =>
                                        RegExp(r'^\d{6}$').hasMatch((v ?? '').trim()) ? null : 'Enter the 6 digits from the email.',
                                  ),
                                if (_error != null) ...[
                                  const SizedBox(height: 16),
                                  _Note(_error!, tone: tones.crit, icon: Icons.error_outline),
                                ],
                                if (_notice != null) ...[
                                  const SizedBox(height: 16),
                                  _Note(_notice!, tone: tones.info, icon: Icons.info_outline),
                                ],
                                const SizedBox(height: 22),
                                FilledButton.icon(
                                  onPressed: _busy ? null : _submit,
                                  icon: _busy
                                      ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                                      : Icon(!_codeStep && codeAsked ? Icons.mark_email_read_outlined : Icons.login),
                                  label: Text(!_codeStep && codeAsked ? 'Send me a code' : 'Sign in'),
                                ),
                                if (!_codeStep)
                                  Align(
                                    alignment: Alignment.centerRight,
                                    child: TextButton(
                                      onPressed: _busy
                                          ? null
                                          : () => Navigator.of(context).push(
                                              MaterialPageRoute<void>(
                                                builder: (_) => ForgotPasswordScreen(api: widget.api, email: _email.text),
                                              ),
                                            ),
                                      child: const Text('Forgot your password?'),
                                    ),
                                  ),
                                if (_codeStep) ...[
                                  const SizedBox(height: 8),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      TextButton(onPressed: _busy ? null : _back, child: const Text('Back')),
                                      TextButton(
                                        onPressed: _busy ? null : () => _submit(newCode: true),
                                        child: const Text('Send a new code'),
                                      ),
                                    ],
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    const Padding(padding: EdgeInsets.fromLTRB(24, 4, 24, 16), child: ZchpcCredit()),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                      child: server.hasData
                          ? Text(
                              'Server release ${server.data!.release}, API ${server.data!.api}'
                              '${codeAsked ? '' : '\nDevelopment server: there is no mail server, so no one-time code is asked. Staging and production always ask for it.'}',
                              textAlign: TextAlign.center,
                              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                            )
                          : server.hasError
                          ? Text(
                              messageOf(server.error!),
                              textAlign: TextAlign.center,
                              style: TextStyle(color: theme.colorScheme.error),
                            )
                          : const SizedBox.shrink(),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

/// The navy brand band at the top of the sign-in page, like the brand panel of the web sign-in.
class _BrandHeader extends StatelessWidget {
  const _BrandHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(gradient: Brand.gradient),
      padding: EdgeInsets.fromLTRB(24, MediaQuery.paddingOf(context).top + 28, 24, 64),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ProductMark(size: 52, ringed: true),
          const SizedBox(height: 16),
          const Text(
            'Climate Dashboard',
            style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            'On your phone: your station, or every station for national administrators',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.88), fontSize: 14),
          ),
        ],
      ),
    );
  }
}

/// A message in a tinted panel with an icon, so it does not rest on colour alone.
class _Note extends StatelessWidget {
  const _Note(this.text, {required this.tone, required this.icon});

  final String text;
  final Tone tone;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: tone.tint, borderRadius: BorderRadius.circular(10)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: tone.color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(color: tone.color)),
          ),
        ],
      ),
    );
  }
}
