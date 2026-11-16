/**
 * Modal dialogs on shadcn/ui's Dialog and AlertDialog (Radix): focus stays inside, Escape closes, and
 * focus returns to the control that opened it.
 */
import { useEffect, useId, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "./shadcn/alert-dialog";
import { Dialog as DialogRoot, DialogContent, DialogDescription, DialogTitle } from "./shadcn/dialog";
import { Input } from "./shadcn/input";
import { Button, LABEL, cx } from "./ui";

/**
 * The first field of the dialog body. A hidden file input is skipped: it is reached through its button.
 * So are the hidden copies Radix keeps of a pick list or a tick box (aria-hidden): the visible one is a button.
 */
const FIRST_FIELD = "[data-dialog-body] :is(input:not([type=hidden]):not([type=file]), select, textarea, button[role=combobox], button[role=checkbox]):not([disabled]):not([aria-hidden])";

export function Dialog({ open, title, description, onClose, children, footer, size = "md" }: {
  open: boolean; title: string; description?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg";
}) {
  return (
    <DialogRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className={cx("flex max-h-[88vh] flex-col gap-0 rounded-xl p-0 text-ink shadow-pop", size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl")}
        // A dialog is opened to work in its body, so start at its first field: typing then works at
        // once, and Enter does not close the dialog. A dialog without a field keeps focus on Close,
        // where Enter is harmless.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const content = event.currentTarget as HTMLElement;
          (content.querySelector<HTMLElement>(FIRST_FIELD) ?? content.querySelector<HTMLElement>("[data-dialog-close]"))?.focus();
        }}
        // Without a description there is nothing to point aria-describedby at.
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <header className="border-b border-line px-5 py-4 pr-12">
          <DialogTitle className="text-base font-semibold leading-snug">{title}</DialogTitle>
          {description && <DialogDescription className="mt-0.5 text-xs">{description}</DialogDescription>}
        </header>
        <div data-dialog-body className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-line bg-subtle/60 px-5 py-3">{footer}</footer>}
      </DialogContent>
    </DialogRoot>
  );
}

/**
 * Asked before every delete (CD-3.05 section 6). For a bulk delete pass requireText: the user must
 * type that word before the button unlocks, which makes it a deliberate, multi-step action (FR-010).
 * An alert dialog: a click beside it does not close it, and Cancel has the focus at first.
 */
export function ConfirmDialog({ open, title, children, confirmLabel = "Delete", danger = true, requireText, busy, onConfirm, onClose }: {
  open: boolean; title: string; children: ReactNode; confirmLabel?: string; danger?: boolean; requireText?: string; busy?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const confirmId = useId();
  useEffect(() => { if (open) setTyped(""); }, [open]);
  const locked = requireText !== undefined && typed.trim() !== requireText;
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <AlertDialogContent className="max-w-md text-ink shadow-pop"
        onOpenAutoFocus={(event) => {
          // With a word to type, start in its box.
          if (requireText === undefined) return;
          event.preventDefault();
          document.getElementById(confirmId)?.focus();
        }}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left text-sm text-ink-2">{children}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {requireText !== undefined && (
          <div>
            <label htmlFor={confirmId} className={LABEL}>Type {requireText} to confirm</label>
            <Input id={confirmId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {/* Not AlertDialogAction: that would close the dialog before the delete has been answered. */}
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={locked} loading={busy}>{confirmLabel}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
