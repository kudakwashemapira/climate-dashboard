/**
 * One form for every create and edit dialog. As the coding standard asks, a form is a single
 * formData object with one generic change handler; fields are described by data, not by markup.
 * Server validation errors are shown next to the field they belong to. A lost connection is worded
 * differently from a validation failure, because the save may or may not have reached the server.
 * The fields are shadcn/ui components: Input, Textarea, Checkbox and Select (through Choice).
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, NetworkError, describeError } from "../services/http";
import { fromDateTimeLocal, toDateTimeLocal } from "../lib/format";
import { Dialog } from "./Dialog";
import { Checkbox } from "./shadcn/checkbox";
import { Input } from "./shadcn/input";
import { Label } from "./shadcn/label";
import { Textarea } from "./shadcn/textarea";
import { Button, Choice, Field, Notice, cx } from "./ui";

export type FormValue = string | boolean;
export type FormData = Record<string, FormValue>;
export type FormMode = "create" | "edit";
export interface Option { value: string; label: string }

export interface FieldDef {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "number" | "date" | "datetime" | "select" | "textarea" | "checkbox";
  required?: boolean | ((mode: FormMode) => boolean);
  /** A fixed list, or a list that depends on another field (sensors of the chosen station). */
  options?: Option[] | ((form: FormData) => Option[]);
  /** Free text with suggested values, so entries stay consistent. */
  suggestions?: string[];
  hint?: ReactNode | ((form: FormData) => ReactNode);
  placeholder?: string;
  step?: string;
  min?: string;
  max?: string;
  maxLength?: number;
  /** Span both columns. */
  wide?: boolean;
  /** Show the field only when creating or only when editing. */
  only?: FormMode;
  lockedOnEdit?: boolean;
  /** Fields emptied when this one changes, because their choices depend on it. */
  resets?: string[];
}

/** Field name -> message. An empty object means the form may be sent. */
export type FieldErrors = Record<string, string | undefined>;

const isRequired = (f: FieldDef, mode: FormMode): boolean => (typeof f.required === "function" ? f.required(mode) : Boolean(f.required));

/** An API row -> form values (everything a string, except checkboxes). */
export function rowToForm(fields: FieldDef[], row: Record<string, unknown> | null, defaults: FormData = {}): FormData {
  const form: FormData = {};
  for (const f of fields) {
    const raw = row ? row[f.name] : defaults[f.name];
    if (f.type === "checkbox") form[f.name] = Boolean(raw);
    else if (f.type === "password") form[f.name] = "";
    else if (raw === null || raw === undefined) form[f.name] = "";
    else if (f.type === "datetime") form[f.name] = toDateTimeLocal(String(raw));
    else form[f.name] = String(raw);
  }
  return form;
}

/** Form values -> the body sent to the API. Empty optional values become null; an empty password is left out. */
export function formToPayload(fields: FieldDef[], form: FormData, mode: FormMode): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.only && f.only !== mode) continue;
    const value = form[f.name];
    if (f.type === "checkbox") payload[f.name] = Boolean(value);
    else if (f.type === "password") { if (value) payload[f.name] = value; }
    else if (f.type === "datetime") payload[f.name] = fromDateTimeLocal(String(value ?? ""));
    else if (value === "" || value === undefined) payload[f.name] = isRequired(f, mode) ? "" : null;
    else payload[f.name] = value;
  }
  return payload;
}

export function FormDialog({ open, mode, title, description, fields, initial, submitLabel, validate, serverErrorHint, onSubmit, onClose, children }: {
  open: boolean; mode: FormMode; title: string; description?: ReactNode; fields: FieldDef[]; initial: FormData;
  submitLabel?: string;
  /** Checks made before anything is sent: rules the server enforces without a readable message. */
  validate?: (form: FormData, mode: FormMode) => FieldErrors;
  /** What to tell the user when the server fails (HTTP 500) on this form, if a likely cause is known. */
  serverErrorHint?: string;
  onSubmit: (payload: Record<string, unknown>, form: FormData) => Promise<unknown>; onClose: () => void; children?: ReactNode;
}) {
  const [formData, setFormData] = useState<FormData>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setFormData(initial); setErrors({}); setProblem(null); }
    // The form resets when the dialog opens, not when the parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // One change handler for every field.
  const change = (field: FieldDef, value: FormValue) => {
    setFormData((current) => {
      const next = { ...current, [field.name]: value };
      for (const dependent of field.resets ?? []) next[dependent] = "";
      return next;
    });
    if (errors[field.name]) setErrors((current) => ({ ...current, [field.name]: "" }));
  };

  const visible = fields.filter((f) => !f.only || f.only === mode);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    const found = validate ? validate(formData, mode) : {};
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await onSubmit(formToPayload(fields, formData, mode), formData);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.status >= 500 && serverErrorHint) {
        setProblem(new Error(serverErrorHint));
      } else if (error instanceof ApiError) {
        const known = new Set(visible.map((f) => f.name));
        const fieldErrors: FieldErrors = {};
        const rest: string[] = [];
        for (const [key, text] of Object.entries(error.fields)) {
          if (known.has(key)) fieldErrors[key] = text;
          else rest.push(key === "detail" || key === "non_field_errors" ? text : `${key.replace(/_/g, " ")}: ${text}`);
        }
        setErrors(fieldErrors);
        setProblem(rest.length || !Object.keys(fieldErrors).length ? new Error(rest.join(" ") || error.message) : null);
      } else {
        setProblem(error);
      }
    } finally {
      setSaving(false);
    }
  };

  const formId = `form-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <Dialog open={open} title={title} description={description} onClose={onClose}
      footer={<>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" type="submit" form={formId} loading={saving}>{submitLabel ?? (mode === "create" ? "Create" : "Save changes")}</Button>
      </>}>
      <form id={formId} onSubmit={submit} noValidate className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
        {problem != null && (
          <div className="sm:col-span-2">
            {problem instanceof NetworkError
              ? <Notice tone="warn" title="No reply was received">The connection dropped before the server answered, so this may or may not have been saved. Close this dialog and check the list before trying again.</Notice>
              : <Notice tone="crit" title="This could not be saved">{describeError(problem)}</Notice>}
          </div>
        )}
        {children && <div className="sm:col-span-2">{children}</div>}
        {visible.map((f) => {
          const id = `${formId}-${f.name}`;
          const value = formData[f.name];
          const required = isRequired(f, mode);
          const error = errors[f.name] || undefined;
          const hint = typeof f.hint === "function" ? f.hint(formData) : f.hint;
          const disabled = saving || (mode === "edit" && f.lockedOnEdit);
          const described = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
          const common = { id, name: f.name, disabled, required, "aria-invalid": error ? true : undefined, "aria-describedby": described } as const;
          const inputClass = cx("bg-background text-ink", error && "border-crit focus-visible:ring-crit");

          if (f.type === "checkbox") {
            return (
              <div key={f.name} className={cx("flex items-start gap-2 pt-1", f.wide && "sm:col-span-2")}>
                <Checkbox {...common} required={false} className="mt-0.5"
                  checked={Boolean(value)} onCheckedChange={(checked) => change(f, checked === true)} />
                <div>
                  <Label htmlFor={id} className="font-medium leading-normal text-ink">{f.label}</Label>
                  {hint && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
                  {error && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-crit">{error}</p>}
                </div>
              </div>
            );
          }
          const choices = typeof f.options === "function" ? f.options(formData) : f.options ?? [];
          return (
            <Field key={f.name} label={f.label} htmlFor={id} required={required} hint={hint} error={error}
              className={cx((f.wide || f.type === "textarea") && "sm:col-span-2")}>
              {f.type === "select" ? (
                <Choice id={id} value={String(value ?? "")} onChange={(v) => change(f, v)} options={choices}
                  emptyLabel={required ? undefined : "None"} disabled={disabled} invalid={Boolean(error)} describedBy={described} />
              ) : f.type === "textarea" ? (
                <Textarea {...common} className={cx(inputClass, "min-h-[76px]")} rows={3} maxLength={f.maxLength} placeholder={f.placeholder}
                  value={String(value ?? "")} onChange={(e) => change(f, e.target.value)} />
              ) : (
                <>
                  <Input {...common} className={inputClass}
                    type={f.type === "datetime" ? "datetime-local" : f.type ?? "text"}
                    inputMode={f.type === "number" ? "decimal" : undefined}
                    step={f.step} min={f.min} max={f.max} maxLength={f.maxLength} placeholder={f.placeholder}
                    list={f.suggestions ? `${id}-list` : undefined}
                    autoComplete={f.type === "password" ? "new-password" : "off"}
                    value={String(value ?? "")} onChange={(e) => change(f, e.target.value)} />
                  {f.suggestions && <datalist id={`${id}-list`}>{f.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
                </>
              )}
            </Field>
          );
        })}
      </form>
    </Dialog>
  );
}

// ---- checks shared by several forms ---------------------------------------------------------------
/** "End" must not be before "start" (dates or date-times in the form's own text format compare correctly). */
export function checkOrder(form: FormData, start: string, end: string, message: string): FieldErrors {
  const a = String(form[start] ?? "");
  const b = String(form[end] ?? "");
  return a && b && b < a ? { [end]: message } : {};
}

/** A number, when given, must lie between lo and hi. */
export function checkRange(form: FormData, name: string, lo: number, hi: number, message: string): FieldErrors {
  const text = String(form[name] ?? "").trim();
  if (!text) return {};
  const n = Number(text);
  return Number.isFinite(n) && n >= lo && n <= hi ? {} : { [name]: message };
}
