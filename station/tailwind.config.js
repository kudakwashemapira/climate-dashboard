import animate from "tailwindcss-animate";

// Colours are CSS variables (src/index.css) so the light and dark themes swap in one place.
// The palette follows CD-3.05 section 5: navy #1F3864 and blue #2E5597, neutral greys, status tones.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        page: token("page"),
        surface: token("surface"),
        subtle: token("subtle"),
        line: token("line"),
        "line-strong": token("line-strong"),
        ink: token("ink"),
        "ink-2": token("ink-2"),
        muted: token("muted"),
        accent: token("accent"),
        "on-accent": token("on-accent"),
        good: token("good"),
        "good-tint": token("good-tint"),
        warn: token("warn"),
        "warn-tint": token("warn-tint"),
        crit: token("crit"),
        "crit-tint": token("crit-tint"),
        info: token("info"),
        "info-tint": token("info-tint"),
        neutral: token("neutral"),
        "neutral-tint": token("neutral-tint"),
        brand: { DEFAULT: "#1F3864", blue: "#2E5597" },
        // The names the shadcn/ui components (src/components/shadcn) use, on the same tokens. Their
        // "accent" (a hover background) and "muted" (a background) would clash with the tokens above,
        // so those components were changed to say subtle, ink and muted instead.
        background: token("surface"),
        foreground: token("ink"),
        primary: { DEFAULT: token("accent"), foreground: token("on-accent") },
        secondary: { DEFAULT: token("subtle"), foreground: token("ink") },
        destructive: { DEFAULT: token("crit"), foreground: token("surface") },
        popover: { DEFAULT: token("surface"), foreground: token("ink") },
        border: token("line"),
        input: token("line-strong"),
        ring: token("accent"),
        sidebar: {
          DEFAULT: token("sidebar"),
          muted: token("sidebar-muted"),
          foreground: token("sidebar-muted"),
          accent: token("sidebar-accent"),
          "accent-foreground": token("sidebar-ink"),
          border: token("sidebar-border"),
          ring: token("sidebar-ink"),
          primary: token("sidebar-ink"),
          "primary-foreground": token("sidebar"),
        },
      },
      borderColor: { DEFAULT: token("line") },
      fontFamily: {
        sans: ['"Segoe UI"', "Calibri", "system-ui", "-apple-system", "Roboto", '"Helvetica Neue"', "Arial", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(15 27 51 / 0.06), 0 1px 3px rgb(15 27 51 / 0.04)",
        pop: "0 12px 32px rgb(15 27 51 / 0.22)",
      },
    },
  },
  plugins: [animate],
};
