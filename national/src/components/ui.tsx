/**
 * Small building blocks shared by every screen. Meaning is never carried by colour alone (CD-3.05 section 6).
 * Buttons, labels and pick lists are shadcn/ui components (./shadcn) with the props the screens already use.
 */
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Inbox, Info, Loader2, MinusCircle, RefreshCw, WifiOff, type LucideIcon } from "lucide-react";
import { NetworkError, describeError } from "../services/http";
import { fmtPct } from "../lib/format";
import { cn } from "../lib/utils";
import { Button as ShadButton } from "./shadcn/button";
import { Label } from "./shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./shadcn/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "./shadcn/tooltip";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---- buttons -------------------------------------------------------------------------------------
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANT = { primary: "default", secondary: "outline", ghost: "ghost", danger: "destructive" } as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, children, disabled, type = "button", ...rest }, ref,
) {
  return (
    <ShadButton ref={ref} type={type} variant={VARIANT[variant]} size={size === "sm" ? "sm" : "default"} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </ShadButton>
  );
});

/** An icon-only button. The label is required: it is what a screen reader announces, and the tooltip shows it on hover and keyboard focus. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(function IconButton(
  { label, children, className, type = "button", ...rest }, ref,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ShadButton ref={ref} type={type} variant="ghost" size="icon" aria-label={label} className={cn("text-ink-2", className)} {...rest}>
          {children}
        </ShadButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
});

// ---- form field ----------------------------------------------------------------------------------
/** The look of the .label class (index.css), as utilities: they replace the Label component's own size and weight. */
export const LABEL = "mb-1 block text-xs font-semibold leading-normal text-ink-2";

export function Field({ label, htmlFor, required, hint, error, children, className }: {
  label: string; htmlFor: string; required?: boolean; hint?: ReactNode; error?: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className={LABEL}>
        {label}
        {required && <span className="text-crit" aria-hidden> *</span>}
        {required && <span className="sr-only"> (required)</span>}
      </Label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1 flex items-start gap-1 text-xs font-medium text-crit">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

// ---- badges --------------------------------------------------------------------------------------
export type Tone = "neutral" | "good" | "warn" | "crit" | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-neutral-tint text-neutral",
  good: "bg-good-tint text-good",
  warn: "bg-warn-tint text-warn",
  crit: "bg-crit-tint text-crit",
  info: "bg-info-tint text-info",
};
const TONE_ICON: Record<Tone, LucideIcon> = { neutral: MinusCircle, good: CheckCircle2, warn: AlertTriangle, crit: AlertCircle, info: Info };

/** A status label. The icon and the words carry the meaning; the colour only supports them. */
export function Badge({ tone = "neutral", children, icon = true }: { tone?: Tone; children: ReactNode; icon?: boolean }) {
  const Icon = TONE_ICON[tone];
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", TONE_CLASS[tone])}>
      {icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </span>
  );
}

// ---- cards ---------------------------------------------------------------------------------------
export function Card({ title, description, actions, children, className, padded = true }: {
  title?: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <section className={cx("card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-5" : undefined}>{children}</div>
    </section>
  );
}

/** A headline figure: label, value, and a line of context. The value is the chart. */
/**
 * KPI cards in rows of equal length (CD-3.05: one page pattern): 6 cards as two rows of 3, 5 in one
 * row on a wide screen, 4 or 8 in rows of 4. A grid that fills rows greedily would leave 4 and 2.
 */
export function KpiGrid({ count, children }: { count: number; children: ReactNode }) {
  const columns = count % 4 === 0 ? "sm:grid-cols-2 xl:grid-cols-4"
    : count % 3 === 0 ? "sm:grid-cols-2 lg:grid-cols-3"
    : count === 5 ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
    : count === 2 ? "sm:grid-cols-2" : "";
  return <div className={cx("grid grid-cols-1 gap-4", columns)}>{children}</div>;
}

export function KpiCard({ label, value, detail, icon: Icon, tone = "info" }: {
  label: string; value: ReactNode; detail?: ReactNode; icon: LucideIcon; tone?: Tone;
}) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONE_CLASS[tone])} aria-hidden>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold leading-tight text-ink">{value}</p>
        {detail && <p className="mt-1 text-xs text-ink-2">{detail}</p>}
      </div>
    </div>
  );
}

/** A share of 100 as a bar with its figure beside it. Thresholds decide the tone; the number is always shown. */
export function Meter({ value, label, good = 95, warn = 80 }: { value: number | null; label?: string; good?: number; warn?: number }) {
  if (value === null) return <span className="text-muted">no data</span>;
  const tone = value >= good ? "bg-good" : value >= warn ? "bg-warn" : "bg-crit";
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${label ?? "Value"} ${fmtPct(value)}`}>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-subtle">
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </div>
      <span className="w-14 text-right text-xs font-semibold text-ink">{fmtPct(value)}</span>
    </div>
  );
}

// ---- states --------------------------------------------------------------------------------------
export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({ title, hint, action, icon: Icon = Inbox }: { title: string; hint?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-subtle text-muted" aria-hidden>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-md text-ink-2">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A failed read. "No reply" and "the server refused" are worded differently on purpose. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof NetworkError;
  const Icon = offline ? WifiOff : AlertCircle;
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center" role="alert">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-crit-tint text-crit" aria-hidden>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 font-semibold text-ink">{offline ? "Cannot reach the server" : "This could not be loaded"}</p>
      <p className="mt-1 max-w-md text-ink-2">{describeError(error)}</p>
      {onRetry && <Button className="mt-4" icon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** An inline message inside a form or a card. */
export function Notice({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const Icon = TONE_ICON[tone];
  return (
    <div className={cx("flex gap-2.5 rounded-md px-3.5 py-3", TONE_CLASS[tone])} role={tone === "crit" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
      </div>
    </div>
  );
}

/** Two or three choices shown side by side, for example "Chart" and "Table". */
export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string; icon?: ReactNode }>; label: string;
}) {
  return (
    <div className="inline-flex rounded-md border border-line bg-subtle p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={cx("inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold",
            value === o.value ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        <p className="mt-1 max-w-3xl text-ink-2">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** The filter row above the content it scopes: one row, left aligned. */
export function FilterBar({ children, onReset }: { children: ReactNode; onReset?: () => void }) {
  return (
    <div className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-3">
      {children}
      {onReset && <Button variant="ghost" size="sm" onClick={onReset} className="mb-0.5">Clear filters</Button>}
    </div>
  );
}

// ---- pick lists ----------------------------------------------------------------------------------
/** Stands for the empty value in the list: a shadcn/ui (Radix) Select item cannot have "" as its value. */
const EMPTY = "__empty__";

/**
 * A pick list (shadcn/ui Select). The value "" is "nothing chosen": emptyLabel names it as a choice
 * ("All", "None"); without one, the placeholder shows until a value is picked. Give the label a
 * htmlFor of id.
 */
export function Choice({ id, value, onChange, options, emptyLabel, placeholder = "Choose…", disabled, invalid, describedBy, className }: {
  id: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>;
  emptyLabel?: string; placeholder?: string; disabled?: boolean; invalid?: boolean; describedBy?: string; className?: string;
}) {
  const shown = value === "" && emptyLabel !== undefined ? EMPTY : value;
  return (
    // Radix can report "" when the list changes under a chosen value; only a real pick is passed on.
    <Select value={shown} onValueChange={(next) => { if (next) onChange(next === EMPTY ? "" : next); }} disabled={disabled}>
      <SelectTrigger id={id} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        className={cn("min-h-[36px] bg-background text-ink", invalid && "border-crit focus:ring-crit", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel !== undefined && <SelectItem value={EMPTY}>{emptyLabel}</SelectItem>}
        {options.filter((o) => o.value !== "").map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** A labelled pick list for a filter row. Pass allLabel={null} when a value must always be chosen. */
export function SelectFilter({ id, label, value, onChange, options, allLabel = "All", className }: {
  id: string; label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>;
  allLabel?: string | null; className?: string;
}) {
  return (
    <div className={cx("min-w-[10rem]", className)}>
      <Label htmlFor={id} className={LABEL}>{label}</Label>
      <Choice id={id} value={value} onChange={onChange} options={options} emptyLabel={allLabel ?? undefined} />
    </div>
  );
}

/**
 * A four-digit year for a filter row. The value is passed on only once it is a whole year in range,
 * so a half-typed year sends nothing to the server.
 */
export function YearInput({ id, label, value, onChange, min = 1900, max = 2200 }: {
  id: string; label: string; value: number; onChange: (year: number) => void; min?: number; max?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const usable = (text: string): boolean => /^\d{4}$/.test(text) && Number(text) >= min && Number(text) <= max;
  return (
    <div className="w-28">
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} className={cx("input", !usable(draft) && "input-error")} type="number" inputMode="numeric" min={min} max={max} step={1}
        value={draft} aria-invalid={!usable(draft) || undefined}
        onChange={(e) => { setDraft(e.target.value); if (usable(e.target.value)) onChange(Number(e.target.value)); }} />
    </div>
  );
}
