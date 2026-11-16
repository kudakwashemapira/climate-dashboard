/**
 * "Forgot your password?" on both sign-in pages (CD-4.10 user manual: the reset flow; CD-4.09: users
 * change or reset a password). Three steps:
 *   1. the email address: POST /api/users/password-reset/ sends a 6-digit reset code to an active
 *      account. The reply is the same for every address, so the page never says whether one exists;
 *   2. the code and a new password: POST /api/users/password-reset/confirm/. The server checks the
 *      strength rules first, so a refused password does not use up the code;
 *   3. done: every earlier sign-in of the account has ended; sign in with the new password.
 */
import { useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, MailCheck } from "lucide-react";
import { AuthLayout } from "../components/AuthLayout";
import { Button, Field, Notice } from "../components/ui";
import { useSignInCode } from "../hooks/useSignInCode";
import { ApiError, describeError, send } from "../services/http";

export const PASSWORD_RULES = "At least 10 characters, not only digits, not a common password, and not close to your name or email.";

export function ForgotPassword({ appLabel, highlights, email = "", onBack }: {
  appLabel: string; highlights?: string[]; email?: string; onBack: () => void;
}) {
  const [formData, setFormData] = useState({ email, code: "", password: "", again: "" });
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const mailServer = useSignInCode(); // false only on a development machine without a mail server
  const change = (name: keyof typeof formData, value: string) => {
    setFormData((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "", form: "" }));
  };

  const requestCode = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(formData.email.trim())) { setErrors({ email: "Enter the email address of your account." }); return; }
    setBusy(true); setErrors({});
    try {
      const reply = await send<{ detail: string }>("POST", "/users/password-reset/", { email: formData.email.trim() });
      setNotice(reply.detail);
      setFormData((current) => ({ ...current, code: "" }));
      setStep("code");
    } catch (problem) {
      setErrors({ form: describeError(problem) });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!/^\d{6}$/.test(formData.code.trim())) found.code = "Enter the 6 digits from the email.";
    if (formData.password.length < 10) found.password = "Use at least 10 characters.";
    else if (formData.password !== formData.again) found.again = "The two entries are not the same.";
    if (Object.keys(found).length) { setErrors(found); return; }
    setBusy(true); setErrors({}); setNotice("");
    try {
      await send("POST", "/users/password-reset/confirm/", { email: formData.email.trim(), code: formData.code.trim(), new_password: formData.password });
      setStep("done");
    } catch (problem) {
      if (problem instanceof ApiError && (problem.fields.code || problem.fields.new_password)) {
        setErrors({ code: problem.fields.code ?? "", password: problem.fields.new_password ?? "" });
      } else {
        setErrors({ form: describeError(problem) });
      }
    } finally {
      setBusy(false);
    }
  };

  const title = step === "done" ? "Password changed" : "Reset your password";
  const description = step === "email"
    ? "Enter the email address of your account. A 6-digit reset code is sent to it."
    : step === "code"
      ? <>Enter the code sent to <span className="font-semibold text-ink">{formData.email.trim()}</span> and choose a new password.</>
      : "Every earlier sign-in of your account has ended. Sign in with the new password.";

  return (
    <AuthLayout appLabel={appLabel} highlights={highlights} title={title} description={description}>
      {step === "email" && (
        <form onSubmit={requestCode} noValidate className="space-y-3.5">
          <Field label="Email" htmlFor="reset-email" required error={errors.email}>
            <input id="reset-email" type="email" className="input" autoComplete="username" autoFocus value={formData.email} onChange={(e) => change("email", e.target.value)} />
          </Field>
          {errors.form && <Notice tone="crit">{errors.form}</Notice>}
          <Button variant="primary" type="submit" className="w-full" loading={busy} icon={<MailCheck className="h-4 w-4" aria-hidden />}>Send me a reset code</Button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={confirm} noValidate className="space-y-3.5">
          {notice && <Notice tone="good">{notice}</Notice>}
          {!mailServer && (
            <Notice tone="info">Development machine: there is no mail server, so the reset email is printed in the worker log (docker compose logs --tail 20 celery-worker).</Notice>
          )}
          <Field label="Reset code" htmlFor="reset-code" required error={errors.code}>
            <input id="reset-code" className="input text-center text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
              value={formData.code} onChange={(e) => change("code", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="New password" htmlFor="reset-password" required error={errors.password} hint={PASSWORD_RULES}>
            <input id="reset-password" type="password" className="input" autoComplete="new-password" value={formData.password} onChange={(e) => change("password", e.target.value)} />
          </Field>
          <Field label="New password again" htmlFor="reset-again" required error={errors.again}>
            <input id="reset-again" type="password" className="input" autoComplete="new-password" value={formData.again} onChange={(e) => change("again", e.target.value)} />
          </Field>
          {errors.form && <Notice tone="crit">{errors.form}</Notice>}
          <Button variant="primary" type="submit" className="w-full" loading={busy} icon={<KeyRound className="h-4 w-4" aria-hidden />}>Set the new password</Button>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => requestCode()} disabled={busy}>Send a new code</Button>
          </div>
        </form>
      )}

      {step === "done" && (
        <Notice tone="good">Your password was changed.</Notice>
      )}

      <div className="mt-4">
        <Button variant={step === "done" ? "primary" : "ghost"} size={step === "done" ? undefined : "sm"} className={step === "done" ? "w-full" : undefined}
          onClick={onBack} icon={<ArrowLeft className="h-3.5 w-3.5" aria-hidden />}>
          Back to sign in
        </Button>
      </div>
    </AuthLayout>
  );
}
