/**
 * Station sign-in with a one-time code (FR-020, UC-001; screen SCR-030): POST /api/instauth/login/.
 *   Step 1  {email, password, station_code}      -> {otp_required: true}; a code is emailed
 *           (the national sign-in has the same two steps, without the station: FR-020, SEC-2)
 *   Step 2  the same fields plus {otp}           -> {access, refresh, user}
 * The station is named by its code (HRE-001), which a station user knows. Its number, the Station ID
 * of the national app, is accepted too: a value made of digits only is also sent as station_id.
 * The server answers 401 "Invalid credentials." for a wrong email, password or station alike, so
 * the message here does not say which one was wrong either.
 */
import { useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, LogIn, MailCheck } from "lucide-react";
import { AuthLayout } from "../components/AuthLayout";
import { ForgotPassword } from "../modules/passwordReset";
import { Button, Field, Notice } from "../components/ui";
import { useSignInCode } from "../hooks/useSignInCode";
import { ApiError, describeError, send } from "../services/http";
import { setSession, type Session } from "../services/session";

/** The tokens at once where no code is asked (a development machine), otherwise the request for a code. */
type Reply = Session | { otp_required: true };

/** What the app offers, for the brand panel of the sign-in and password reset pages. */
const HIGHLIGHTS = [
  "Add a reading, or upload a whole template file with a preview first",
  "Sensors and their calibration history, kept up to date",
  "Your station's figures, alerts and exports at a glance",
];

export default function Login() {
  const [formData, setFormData] = useState({ email: "", password: "", station: "", otp: "" });
  const [step, setStep] = useState<"account" | "code">("account");
  const [busy, setBusy] = useState<"submit" | "resend" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [forgot, setForgot] = useState(false);
  const codeAsked = useSignInCode(); // false only on a development machine without a mail server
  const change = (name: keyof typeof formData, value: string) => { setFormData((current) => ({ ...current, [name]: value })); setError(""); };

  const account = () => {
    const station = formData.station.trim();
    return { email: formData.email.trim(), password: formData.password, station_code: station, ...(/^\d+$/.test(station) ? { station_id: Number(station) } : {}) };
  };

  const explain = (problem: unknown): string => {
    if (problem instanceof ApiError && problem.status === 401) {
      return step === "code" && formData.otp
        ? "That code is not correct or has expired. Check the latest email, or send a new code."
        : "The email, password or station code is not correct. Each station has its own account: use that account's email and the station's code with its hyphen, for example MRD-001. A national superadmin signs in to the national app instead.";
    }
    return describeError(problem);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setNotice("");
    if (!formData.email.trim() || !formData.password || !formData.station.trim()) {
      setError("Enter your email, your password and your station code.");
      return;
    }
    if (step === "code" && !/^\d{6}$/.test(formData.otp.trim())) { setError("Enter the 6-digit code from the email."); return; }
    setBusy("submit");
    try {
      const reply = await send<Reply>("POST", "/instauth/login/", step === "code" ? { ...account(), otp: formData.otp.trim() } : account());
      if ("access" in reply) setSession(reply);
      else { setStep("code"); setError(""); }
    } catch (problem) {
      setError(explain(problem));
    } finally {
      setBusy(null);
    }
  };

  const resend = async () => {
    setBusy("resend"); setError(""); setNotice("");
    try {
      await send<Reply>("POST", "/instauth/login/", account());
      change("otp", "");
      setNotice("A new code was sent. Earlier codes no longer work.");
    } catch (problem) {
      setError(explain(problem));
    } finally {
      setBusy(null);
    }
  };

  const back = () => { setStep("account"); setError(""); setNotice(""); change("otp", ""); };

  if (forgot) return <ForgotPassword appLabel="Station application" highlights={HIGHLIGHTS} email={formData.email} onBack={() => setForgot(false)} />;

  return (
    <AuthLayout appLabel="Station application"
      highlights={HIGHLIGHTS}
      title={step === "account" ? "Sign in to your station" : "Enter your one-time code"}
      description={step === "account"
        ? codeAsked
          ? "Use the account your national administrator gave you. A one-time code is then sent to your email."
          : "Use the account your national administrator gave you."
        : <>A 6-digit code was sent to <span className="font-semibold text-ink">{formData.email.trim()}</span>. It works once and expires after a few minutes.</>}
      footer="There is no self-registration. Station accounts are created by a national administrator.">
      <form onSubmit={submit} noValidate className="space-y-3.5">
        {step === "account" ? (
          <>
            <Field label="Email" htmlFor="login-email" required>
              <input id="login-email" type="email" className="input" autoComplete="username" autoFocus value={formData.email} onChange={(e) => change("email", e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="login-password" required>
              <input id="login-password" type="password" className="input" autoComplete="current-password" value={formData.password} onChange={(e) => change("password", e.target.value)} />
            </Field>
            <Field label="Station code" htmlFor="login-station" required hint="The code of the station your account belongs to, for example HRE-001. Its station ID number also works. Each station has its own accounts.">
              <input id="login-station" className="input" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={formData.station} onChange={(e) => change("station", e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="One-time code" htmlFor="login-otp" required>
            <input id="login-otp" className="input text-center text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
              value={formData.otp} onChange={(e) => change("otp", e.target.value.replace(/\D/g, ""))} />
          </Field>
        )}
        {error && <Notice tone="crit">{error}</Notice>}
        {notice && <Notice tone="good">{notice}</Notice>}
        <Button variant="primary" type="submit" className="w-full" loading={busy === "submit"} disabled={busy !== null}
          icon={step === "account" && codeAsked ? <MailCheck className="h-4 w-4" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}>
          {step === "account" && codeAsked ? "Send me a code" : "Sign in"}
        </Button>
        {step === "account" && !codeAsked && (
          <p className="text-xs text-muted">Development machine: there is no mail server here, so no one-time code is asked. Staging and production always ask for it.</p>
        )}
        {step === "account" && (
          <div className="text-right">
            <Button variant="ghost" size="sm" onClick={() => setForgot(true)}>Forgot your password?</Button>
          </div>
        )}
        {step === "code" && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={back} disabled={busy !== null} icon={<ArrowLeft className="h-3.5 w-3.5" aria-hidden />}>Use another account</Button>
            <Button variant="ghost" size="sm" onClick={resend} loading={busy === "resend"} disabled={busy !== null} icon={<KeyRound className="h-3.5 w-3.5" aria-hidden />}>Send a new code</Button>
          </div>
        )}
      </form>
    </AuthLayout>
  );
}
