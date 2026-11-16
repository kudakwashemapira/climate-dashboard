/**
 * The Climate Dashboard mark: sun, cloud and rain on the brand navy and blue (CD-3.05 section 5).
 * The same drawing is the favicon of both web apps (public/favicon.svg) and the launcher icon of the
 * phone app (mobile/assets/icon/), so the three apps read as one product. The sun and rain colours
 * are Okabe-Ito orange and sky blue, the colour-blind-safe palette of the charts.
 *
 * Decorative: the product name is always written next to it, so it is hidden from screen readers.
 */
import { useId } from "react";
import { cx } from "./ui";

export function ProductMark({ className, ringed = false }: { className?: string; ringed?: boolean }) {
  const gradient = `mark-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 48 48" className={cx("shrink-0", ringed && "rounded-[23%] ring-1 ring-white/30", className)} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1F3864" />
          <stop offset="1" stopColor="#2E5597" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill={`url(#${gradient})`} />
      <path d="M31 6.2v2.6M39.8 15.5h-2.6M37.4 9.1l-1.8 1.8M24.6 9.1l1.8 1.8" stroke="#E69F00" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <circle cx="31" cy="15.5" r="5.2" fill="#E69F00" />
      <path d="M13.5 32.5A5 5 0 0 1 14.2 22.6A7.6 7.6 0 0 1 28.9 21.2A5.7 5.7 0 0 1 33.8 32.5Z" fill="#FFFFFF" />
      <path d="M18.5 36.5l-1.6 4.2M24.5 36.5l-1.6 4.2M30.5 36.5l-1.6 4.2" stroke="#56B4E9" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
