import 'package:flutter/material.dart';

import '../theme.dart';

/// The Climate Dashboard mark: sun, cloud and rain on the brand navy and blue. The same drawing as
/// frontend/*/src/components/ProductMark.tsx and the launcher icon (assets/icon/), on a 48-unit grid.
/// Decorative: the product name is always written next to it.
class ProductMark extends StatelessWidget {
  const ProductMark({super.key, this.size = 48, this.ringed = false});

  final double size;

  /// A thin light ring, for when the mark sits on a navy background.
  final bool ringed;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: ringed
            ? BoxDecoration(
                borderRadius: BorderRadius.circular(size * 11 / 48),
                border: Border.all(color: Colors.white.withValues(alpha: 0.3)),
              )
            : null,
        child: CustomPaint(painter: _MarkPainter()),
      ),
    );
  }
}

class _MarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 48, size.height / 48);
    const square = Rect.fromLTWH(0, 0, 48, 48);
    canvas.drawRRect(RRect.fromRectAndRadius(square, const Radius.circular(11)), Paint()..shader = Brand.gradient.createShader(square));

    final rays = Paint()
      ..color = Brand.sun
      ..strokeWidth = 2.2
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(const Offset(31, 6.2), const Offset(31, 8.8), rays);
    canvas.drawLine(const Offset(39.8, 15.5), const Offset(37.2, 15.5), rays);
    canvas.drawLine(const Offset(37.4, 9.1), const Offset(35.6, 10.9), rays);
    canvas.drawLine(const Offset(24.6, 9.1), const Offset(26.4, 10.9), rays);
    canvas.drawCircle(const Offset(31, 15.5), 5.2, Paint()..color = Brand.sun);

    final cloud = Path()
      ..moveTo(13.5, 32.5)
      ..arcToPoint(const Offset(14.2, 22.6), radius: const Radius.circular(5))
      ..arcToPoint(const Offset(28.9, 21.2), radius: const Radius.circular(7.6))
      ..arcToPoint(const Offset(33.8, 32.5), radius: const Radius.circular(5.7))
      ..close();
    canvas.drawPath(cloud, Paint()..color = Colors.white);

    final rain = Paint()
      ..color = Brand.rain
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round;
    for (final x in [18.5, 24.5, 30.5]) {
      canvas.drawLine(Offset(x, 36.5), Offset(x - 1.6, 40.7), rain);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
