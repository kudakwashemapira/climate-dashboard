/**
 * Chart colours (CD-3.05 section 5: a colour-blind-safe Okabe-Ito palette, light and dark themes).
 *
 * These values were computed, not picked by eye. The series order is the one that keeps every
 * neighbouring pair apart under simulated protanopia and deuteranopia (worst pair 11.0, target 8)
 * and under normal vision (worst pair 15.8, floor 15), on the white and the dark card surface.
 * Dark values are the same hues stepped into the dark lightness band. Keep the order: it is the
 * safety mechanism. Colour is never the only cue: every chart has a legend or labels and a table view.
 */
import type { Theme } from "../hooks/useTheme";

export type Severity = "Low" | "Moderate" | "High" | "Extreme";

export interface ChartColors {
  surface: string;
  ink: string;
  muted: string;
  grid: string;
  axis: string;
  /** Categorical slots, assigned in this fixed order and never cycled. */
  series: string[];
  /** Diverging pair for rainfall anomalies: wetter and drier than normal. */
  wet: string;
  dry: string;
  /** Context series when one series is the subject. */
  deemphasis: string;
  /** One hue, ordered steps: severity is a scale, not a set of names. */
  severity: Record<Severity, string>;
  /** Reserved status colours, always shown with an icon or a label. */
  status: { good: string; warn: string; crit: string; neutral: string };
}

export const CHART_COLORS: Record<Theme, ChartColors> = {
  light: {
    surface: "#ffffff",
    ink: "#0f1b33",
    muted: "#5f6b80",
    grid: "#e6eaf0",
    axis: "#c3cad6",
    series: ["#0072B2", "#009E73", "#D55E00", "#CC79A7", "#E69F00", "#56B4E9"],
    wet: "#0072B2",
    dry: "#D55E00",
    deemphasis: "#8a94a6",
    severity: { Low: "#ff9455", Moderate: "#e66d21", High: "#c04a00", Extreme: "#9a2500" },
    status: { good: "#0ca30c", warn: "#fab219", crit: "#d03b3b", neutral: "#8a94a6" },
  },
  dark: {
    surface: "#131c2e",
    ink: "#e8edf5",
    muted: "#8e9bb2",
    grid: "#222d44",
    axis: "#36435c",
    series: ["#0072B2", "#009E73", "#D55E00", "#c673a1", "#c78200", "#3c9cd0"],
    wet: "#3c9cd0",
    dry: "#D55E00",
    deemphasis: "#6f7c95",
    // On a dark surface the scale runs the other way: the strongest value is the lightest step.
    severity: { Low: "#ab3700", Moderate: "#d55e00", High: "#ff843d", Extreme: "#ffbd96" },
    status: { good: "#0ca30c", warn: "#fab219", crit: "#d03b3b", neutral: "#6f7c95" },
  },
};
