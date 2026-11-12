import 'package:flutter/material.dart';

/// ZCHPC develops and hosts the Climate Dashboard for the Department of Climate Change and Environmental
/// Services, as the web apps say (components/Zchpc.tsx). The logo stands on a white plate in both themes:
/// its navy lettering needs a light background.
class ZchpcCredit extends StatelessWidget {
  const ZchpcCredit({super.key, this.compact = false});

  /// The globe and one line, for the account sheet; otherwise the whole logo and the department.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final text = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    return Row(
      children: [
        Container(
          padding: EdgeInsets.all(compact ? 3 : 6),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(compact ? 8 : 10),
            border: Border.all(color: theme.colorScheme.outlineVariant),
          ),
          child: compact
              ? Image.asset('assets/brand/zchpc-mark.png', height: 30, width: 30, excludeFromSemantics: true)
              : Image.asset(
                  'assets/brand/zchpc-logo.png',
                  height: 56,
                  semanticLabel: 'ZCHPC: Accelerating innovation through supercomputing',
                ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            compact
                ? 'Developed and hosted by ZCHPC'
                : 'Developed and hosted by ZCHPC for the Department of Climate Change and Environmental Services',
            style: text,
          ),
        ),
      ],
    );
  }
}
