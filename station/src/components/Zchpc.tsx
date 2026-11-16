/**
 * ZCHPC develops and hosts the Climate Dashboard for the Department of Climate Change and Environmental
 * Services (DCCES). Its logo always stands on a white plate, in the light and the dark theme alike: its
 * navy lettering needs a light background. The images in src/assets are cut from ZCHPC's logo.
 */
import logo from "../assets/zchpc-logo.webp";
import mark from "../assets/zchpc-mark.webp";
import { cx } from "./ui";

export const OWNER = "Department of Climate Change and Environmental Services";
const LOGO_ALT = "ZCHPC: Accelerating innovation through supercomputing";

/** The whole logo: globe, name and line. Give the height in className (h-20); the width follows. */
export function ZchpcLogo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex shrink-0 rounded-xl bg-white p-2 shadow-card ring-1 ring-black/5", className)}>
      <img src={logo} alt={LOGO_ALT} width={254} height={240} className="h-full w-auto" />
    </span>
  );
}

/** The globe alone, for small places. Its alt is empty where "ZCHPC" is written beside it. */
export function ZchpcMark({ className, alt = "" }: { className?: string; alt?: string }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-md bg-white p-0.5", className)}>
      <img src={mark} alt={alt} width={96} height={96} className="h-full w-full object-contain" />
    </span>
  );
}
