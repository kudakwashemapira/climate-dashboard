/** Small pieces the national-only screens share. */
import { Link } from "react-router-dom";
import { Checkbox } from "../components/shadcn/checkbox";
import { PROVINCES, STATION_TYPES, options } from "../services/types";

export const PROVINCE_OPTIONS = options(PROVINCES);
export const STATION_TYPE_OPTIONS = options(STATION_TYPES);

export const thisYear = (): number => new Date().getFullYear();

/**
 * A station named by its code, linking to its detail screen. `stacked` puts the name on a second
 * line, for a table with many columns where a wrapped name would make the rows tall.
 */
export function StationLink({ id, code, name, stacked = false }: { id: number; code: string; name?: string; stacked?: boolean }) {
  return (
    <span className={stacked ? "block whitespace-nowrap" : undefined}>
      <Link to={`/stations/${id}`} className="font-semibold text-accent hover:underline">{code}</Link>
      {name && (stacked ? <span className="block text-xs text-ink-2">{name}</span> : <span className="text-ink-2"> {name}</span>)}
    </span>
  );
}

/** An on/off choice in a filter row, for example "Include Suspect readings". */
export function ToggleFilter({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex min-h-[36px] items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
    </div>
  );
}

/** "#0072B2" at the given opacity, for fills that sit on the card surface. */
export function tint(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
