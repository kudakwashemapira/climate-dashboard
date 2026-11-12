/// The look of the app: the colour tokens of the two web apps (frontend/*/src/index.css), so the
/// three apps read as one product (CD-3.05 section 5: navy #1F3864 and blue #2E5597, neutral greys,
/// status tones, light and dark themes). Every text colour keeps a contrast of at least 4.5 to 1 on
/// the surface it is used on, as on the web.
library;

import 'package:flutter/material.dart';

/// The brand colours. Sun and rain are Okabe-Ito orange and sky blue, as in the product mark.
abstract final class Brand {
  static const navy = Color(0xFF1F3864);
  static const blue = Color(0xFF2E5597);
  static const sun = Color(0xFFE69F00);
  static const rain = Color(0xFF56B4E9);

  static const gradient = LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [navy, blue]);
}

/// A status tone: its text or icon colour, and the tint behind it.
class Tone {
  const Tone(this.color, this.tint);

  final Color color;
  final Color tint;
}

/// The five tones of the web apps: good, warn, crit, info and neutral.
@immutable
class Tones extends ThemeExtension<Tones> {
  const Tones({required this.good, required this.warn, required this.crit, required this.info, required this.neutral});

  final Tone good;
  final Tone warn;
  final Tone crit;
  final Tone info;
  final Tone neutral;

  static const light = Tones(
    good: Tone(Color(0xFF17692E), Color(0xFFE6F4EA)),
    warn: Tone(Color(0xFF7A4F00), Color(0xFFFFF3D1)),
    crit: Tone(Color(0xFFB42318), Color(0xFFFDECEA)),
    info: Tone(Color(0xFF234A8C), Color(0xFFE6EEFB)),
    neutral: Tone(Color(0xFF44516A), Color(0xFFEEF1F6)),
  );

  static const dark = Tones(
    good: Tone(Color(0xFF7EE08A), Color(0xFF143321)),
    warn: Tone(Color(0xFFF0C867), Color(0xFF3D2F0B)),
    crit: Tone(Color(0xFFFFB4AB), Color(0xFF4A1D1A)),
    info: Tone(Color(0xFFB3CBF5), Color(0xFF1C2F55)),
    neutral: Tone(Color(0xFFC3CCDB), Color(0xFF232F49)),
  );

  static Tones of(BuildContext context) => Theme.of(context).extension<Tones>() ?? light;

  /// The tone of a share in percent, as on the web dashboard (lib/tones.ts pctTone): 95 or more is
  /// good, 80 or more needs attention, below that is critical. No figure is computed here.
  Tone ofPercent(double? value) => value == null
      ? neutral
      : value >= 95
      ? good
      : value >= 80
      ? warn
      : crit;

  @override
  Tones copyWith({Tone? good, Tone? warn, Tone? crit, Tone? info, Tone? neutral}) => Tones(
    good: good ?? this.good,
    warn: warn ?? this.warn,
    crit: crit ?? this.crit,
    info: info ?? this.info,
    neutral: neutral ?? this.neutral,
  );

  @override
  Tones lerp(Tones? other, double t) => t < 0.5 || other == null ? this : other;
}

/// Surfaces and text, per theme (the --c-* tokens of the web apps).
class _Palette {
  const _Palette({
    required this.page,
    required this.surface,
    required this.subtle,
    required this.line,
    required this.ink,
    required this.ink2,
    required this.muted,
    required this.accent,
    required this.onAccent,
    required this.bar,
  });

  final Color page, surface, subtle, line, ink, ink2, muted, accent, onAccent, bar;

  static const light = _Palette(
    page: Color(0xFFF3F5F9),
    surface: Color(0xFFFFFFFF),
    subtle: Color(0xFFEEF1F6),
    line: Color(0xFFDDE2EA),
    ink: Color(0xFF0F1B33),
    ink2: Color(0xFF44516A),
    muted: Color(0xFF5F6B80),
    accent: Color(0xFF2E5597),
    onAccent: Color(0xFFFFFFFF),
    bar: Color(0xFF1F3864),
  );

  static const dark = _Palette(
    page: Color(0xFF0B1220),
    surface: Color(0xFF131C2E),
    subtle: Color(0xFF1A2540),
    line: Color(0xFF26324A),
    ink: Color(0xFFE8EDF5),
    ink2: Color(0xFFB6C0D2),
    muted: Color(0xFF8E9BB2),
    accent: Color(0xFF8FB0EE),
    onAccent: Color(0xFF0B1220),
    bar: Color(0xFF0E1626),
  );
}

ThemeData buildTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final p = dark ? _Palette.dark : _Palette.light;
  final tones = dark ? Tones.dark : Tones.light;
  final scheme = ColorScheme.fromSeed(seedColor: Brand.blue, brightness: brightness).copyWith(
    primary: p.accent,
    onPrimary: p.onAccent,
    surface: p.surface,
    onSurface: p.ink,
    onSurfaceVariant: p.ink2,
    outline: p.muted,
    outlineVariant: p.line,
    surfaceContainerLowest: p.surface,
    surfaceContainerLow: p.surface,
    surfaceContainer: p.subtle,
    surfaceContainerHigh: p.subtle,
    error: tones.crit.color,
    errorContainer: tones.crit.tint,
    onErrorContainer: tones.crit.color,
  );
  final rounded = RoundedRectangleBorder(borderRadius: BorderRadius.circular(10));
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: p.page,
    dividerColor: p.line,
    extensions: [tones],
    appBarTheme: AppBarTheme(
      backgroundColor: p.bar,
      foregroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      titleTextStyle: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
    ),
    cardTheme: CardThemeData(
      color: p.surface,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: p.line),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.surface,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: p.muted.withValues(alpha: 0.6)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: p.accent, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        shape: rounded,
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(shape: rounded)),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: p.surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: tones.info.tint,
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(color: states.contains(WidgetState.selected) ? p.accent : p.ink2),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontSize: 12,
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
          color: states.contains(WidgetState.selected) ? p.accent : p.ink2,
        ),
      ),
    ),
    chipTheme: ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      side: BorderSide(color: p.line),
    ),
    listTileTheme: ListTileThemeData(iconColor: p.ink2),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}

/// Figures in columns line up when every digit has the same width (CD-3.05: tabular numerals).
const tabularFigures = [FontFeature.tabularFigures()];
