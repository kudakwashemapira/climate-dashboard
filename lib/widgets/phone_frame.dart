import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// In a wide browser window the app is drawn inside a phone outline, at phone size, so the
/// simulation looks and lays out as it would on a handset. On a phone, or in a narrow window,
/// the app fills the screen as usual.
class PhoneFrame extends StatelessWidget {
  const PhoneFrame({super.key, required this.child});

  final Widget child;

  static const _screen = Size(392, 820);
  static const _bezel = 10.0;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    if (!kIsWeb || media.size.width < 600) return child;

    final height = math.min(_screen.height, media.size.height - 72);
    final screen = Size(_screen.width, math.max(480, height));
    return ColoredBox(
      color: const Color(0xFFE6E9F0),
      child: DefaultTextStyle(
        style: const TextStyle(fontSize: 12, color: Color(0xFF4A5468), fontFamily: 'Roboto'),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(_bezel),
              decoration: BoxDecoration(
                color: const Color(0xFF1B1F27),
                borderRadius: BorderRadius.circular(44),
                boxShadow: const [BoxShadow(blurRadius: 24, color: Color(0x33000000), offset: Offset(0, 8))],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(34),
                child: SizedBox.fromSize(
                  size: screen,
                  child: MediaQuery(
                    data: media.copyWith(
                      size: screen,
                      padding: const EdgeInsets.only(top: 12),
                      viewPadding: const EdgeInsets.only(top: 12),
                    ),
                    child: child,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text('Simulated phone. The app calls the Climate Dashboard API at this address under /api/.'),
          ],
        ),
      ),
    );
  }
}
