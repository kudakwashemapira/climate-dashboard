/**
 * The frame of the sign-in screens. On a wide screen a brand panel (the product mark, what the app is
 * for, and what it offers) stands beside the form card; on a narrow one the panel folds into the
 * mark and the product name above the card. The panel is the brand navy to blue of CD-3.05 section 5
 * in both themes; its white text keeps a contrast of at least 4.5 to 1 on either colour. ZCHPC, who
 * develop and host the system, close the panel with their logo; on a narrow screen, with their globe
 * under the card.
 */
import type { ReactNode } from "react";
import { CheckCircle2, Moon, Sun } from "lucide-react";
import { setTheme, useTheme } from "../hooks/useTheme";
import { ProductMark } from "./ProductMark";
import { IconButton } from "./ui";
import { OWNER, ZchpcLogo, ZchpcMark } from "./Zchpc";

/** Faint isobar-like curves behind the brand panel. Decorative only. */
function BrandPattern() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <g fill="none" stroke="white" strokeOpacity="0.09" strokeWidth="1.5">
        <path d="M-40 120C60 70 150 160 240 110s150-60 220-20" />
        <path d="M-40 170C70 120 150 210 250 160s140-50 210-10" />
        <path d="M-40 220C80 175 160 255 260 210s130-40 200 0" />
        <path d="M-40 470c90-60 170 30 260-20s140-70 220-30" />
        <path d="M-40 520c100-55 180 35 270-15s130-60 210-25" />
      </g>
      <g fill="white" fillOpacity="0.06">
        <circle cx="330" cy="70" r="90" />
        <circle cx="40" cy="560" r="120" />
      </g>
    </svg>
  );
}

export function AuthLayout({ appLabel, title, description, children, footer, highlights = [] }: {
  appLabel: string; title: string; description: ReactNode; children: ReactNode; footer?: ReactNode;
  /** What the app offers, in a few short lines for the brand panel. */
  highlights?: string[];
}) {
  const theme = useTheme();
  return (
    <div className="flex min-h-screen bg-page">
      <aside className="relative hidden w-[42%] max-w-xl flex-col justify-between overflow-hidden bg-gradient-to-br from-brand to-brand-blue p-10 text-white lg:flex">
        <BrandPattern />
        <div className="relative flex items-center gap-3">
          <ProductMark className="h-12 w-12" ringed />
          <div className="leading-tight">
            <p className="text-lg font-semibold">Climate Dashboard</p>
            <p className="text-sm text-white/85">{appLabel}</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <p className="text-2xl font-semibold leading-snug">One national record of weather, climate and environmental data.</p>
          <p className="mt-3 text-white/85">
            Monitoring stations across Zimbabwe record their readings here. The figures are checked once, on the server, and every screen and export shows the same numbers.
          </p>
          {highlights.length > 0 && (
            <ul className="mt-6 space-y-3">
              {highlights.map((line) => (
                <li key={line} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white/90" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="relative flex items-center gap-4">
          <ZchpcLogo className="h-28" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/85">Developed and hosted by</p>
            <p className="mt-0.5 text-lg font-semibold leading-tight">ZCHPC</p>
            <p className="mt-1 text-xs leading-snug text-white/85">for the {OWNER}</p>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <div className="flex justify-end p-3">
          <IconButton label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
          </IconButton>
        </div>
        <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-12 lg:items-center lg:pt-0">
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <ProductMark className="h-11 w-11" />
              <div className="leading-tight">
                <p className="text-lg font-semibold text-ink">Climate Dashboard</p>
                <p className="text-sm text-ink-2">{appLabel}</p>
              </div>
            </div>
            <section className="card p-6">
              <h1 className="text-lg font-semibold text-ink">{title}</h1>
              <p className="mt-1 text-ink-2">{description}</p>
              <div className="mt-5">{children}</div>
            </section>
            {footer && <div className="mt-4 text-xs text-muted">{footer}</div>}
            <div className="mt-6 flex items-center gap-3 lg:hidden">
              <ZchpcMark className="h-10 w-10 ring-1 ring-line" />
              <p className="text-xs text-muted">Developed and hosted by <span className="font-semibold text-ink-2">ZCHPC</span> for the {OWNER}</p>
            </div>
            {/* The build in use, set at image build time. Post-deploy check 4 compares it with the release tag. */}
            <p className="mt-2 text-xs text-muted">Release {import.meta.env.VITE_RELEASE || "dev"}</p>
          </div>
        </main>
      </div>
    </div>
  );
}
