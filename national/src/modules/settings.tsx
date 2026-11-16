/**
 * Settings and help (screen SCR-023): the signed-in account, the theme, and how the data is handled.
 *
 * The account shown is the summary the sign-in endpoints return. Every account, station or national,
 * changes its own password here with the current one (POST /api/users/me/password/); a forgotten
 * password is reset from the sign-in page with an emailed code (modules/passwordReset.tsx).
 *
 * The help text states only what the system does (CD-3.05 section 5.1, CD-3.06): for example, the
 * one field encrypted at rest is the station coordinates.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, Moon, Sun } from "lucide-react";
import { useToast } from "../components/Toast";
import { Button, Card, Field, Notice, PageHeader, Segmented } from "../components/ui";
import { OWNER, ZchpcLogo } from "../components/Zchpc";
import { setTheme, useTheme, type Theme } from "../hooks/useTheme";
import { ApiError, describeError, send } from "../services/http";
import { displayName, setSession, useSession, type Session } from "../services/session";
import { PASSWORD_RULES } from "./passwordReset";

/** Change your own password (CD-4.09): POST /api/users/me/password/ with the current password.
 *  The reply carries new tokens, so this sign-in goes on while every other one ends. */
function PasswordCard() {
  const toast = useToast();
  const [formData, setFormData] = useState({ current: "", password: "", again: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const change = (name: keyof typeof formData, value: string) => {
    setFormData((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "", form: "" }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!formData.current) found.current = "Enter your current password.";
    if (formData.password.length < 10) found.password = "Use at least 10 characters.";
    else if (formData.password !== formData.again) found.again = "The two entries are not the same.";
    if (Object.keys(found).length) { setErrors(found); return; }
    setBusy(true);
    try {
      const reply = await send<Session & { detail: string }>("POST", "/users/me/password/", { current_password: formData.current, new_password: formData.password });
      setSession({ access: reply.access, refresh: reply.refresh, user: reply.user });
      setFormData({ current: "", password: "", again: "" });
      toast.success(reply.detail);
    } catch (problem) {
      if (problem instanceof ApiError && (problem.fields.current_password || problem.fields.new_password)) {
        setErrors({ current: problem.fields.current_password ?? "", password: problem.fields.new_password ?? "" });
      } else {
        setErrors({ form: describeError(problem) });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Change your password" description="You stay signed in here. Every other sign-in of your account ends, and you get an email that the password was changed.">
      <form onSubmit={submit} noValidate className="grid max-w-3xl grid-cols-1 gap-3.5 sm:grid-cols-3">
        <Field label="Current password" htmlFor="current-password" required error={errors.current}>
          <input id="current-password" type="password" className="input" autoComplete="current-password" value={formData.current} onChange={(e) => change("current", e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="new-password" required error={errors.password}>
          <input id="new-password" type="password" className="input" autoComplete="new-password" value={formData.password} onChange={(e) => change("password", e.target.value)} />
        </Field>
        <Field label="New password again" htmlFor="new-password-again" required error={errors.again}>
          <input id="new-password-again" type="password" className="input" autoComplete="new-password" value={formData.again} onChange={(e) => change("again", e.target.value)} />
        </Field>
        <p className="text-xs text-muted sm:col-span-3">{PASSWORD_RULES}</p>
        {errors.form && <div className="sm:col-span-3"><Notice tone="crit">{errors.form}</Notice></div>}
        <div className="sm:col-span-3">
          <Button variant="primary" type="submit" loading={busy} icon={<KeyRound className="h-4 w-4" aria-hidden />}>Change password</Button>
        </div>
      </form>
    </Card>
  );
}

function Topic({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-1 space-y-1.5 text-ink-2">{children}</div>
    </div>
  );
}

export function SettingsScreen() {
  const session = useSession();
  const theme = useTheme();
  if (!session) return null;
  const { user } = session;
  const national = user.is_superuser;
  return (
    <div className="space-y-5">
      <PageHeader title="Settings and help" description="Your account, how the screens look, and how the Climate Dashboard handles data." />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Your account">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Name</dt><dd className="mt-0.5 text-ink">{displayName(user)}</dd></div>
            <div><dt className="text-xs text-muted">Email (sign-in name)</dt><dd className="mt-0.5 break-all text-ink">{user.email}</dd></div>
            <div><dt className="text-xs text-muted">Access</dt><dd className="mt-0.5 text-ink">{national ? "National superadmin: all stations" : user.role ? `${user.role.name} (level ${user.role.level})` : "No role assigned: read-only"}</dd></div>
            <div><dt className="text-xs text-muted">Station</dt><dd className="mt-0.5 text-ink">{user.station ? `${user.station.station_code} ${user.station.name}` : "All stations"}</dd></div>
          </dl>
          {!national && <p className="mt-4 text-xs text-muted">To change your name or role, ask a national administrator.</p>}
        </Card>
        <Card title="Appearance" description="Remembered by this browser for this app.">
          <Segmented<Theme> label="Theme" value={theme} onChange={setTheme}
            options={[
              { value: "light", label: "Light", icon: <Sun className="h-3.5 w-3.5" aria-hidden /> },
              { value: "dark", label: "Dark", icon: <Moon className="h-3.5 w-3.5" aria-hidden /> },
            ]} />
        </Card>
      </div>

      <PasswordCard />

      <Card title="How the Climate Dashboard handles data">
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-2">
          <Topic title="Who sees what">
            <p>{national
              ? "As a national superadmin you see the records of every station. When you add a record you choose the station it belongs to."
              : "You see and change only the records of your own station. Records of other stations cannot be opened from this account."}</p>
          </Topic>
          <Topic title="Dates and times">
            <p>Times are stored in UTC and shown in Central Africa Time (UTC+2). A time typed into a form is taken in this computer's time zone.</p>
            <p>In an upload file a time is local station time (Central Africa Time): write 2026-10-11 08:00 for eight in the morning.</p>
          </Topic>
          <Topic title="Numbers and missing values">
            <p>Every value is shown with its unit. A value that is missing is written "no data" and left as a gap in charts; it is never shown as zero.</p>
          </Topic>
          <Topic title="Figures on dashboards and analysis screens">
            <p>Each figure is calculated once on the server, so the same figure reads the same on every screen and in every export.</p>
          </Topic>
          <Topic title="Quality flags">
            <p>Every reading carries a flag: Valid, Estimated, Suspect or Rejected. Rainfall, temperature and regional figures leave out Rejected readings, and leave out Suspect readings unless you choose to include them. Data completeness leaves out only Rejected readings. Counts of readings include all of them.</p>
          </Topic>
          <Topic title="Calibration status">
            <p>A sensor's status comes from its latest calibration: Current while the next due date is more than 30 days away, Due within 30 days, Overdue after it, Unknown when no calibration has been logged.</p>
          </Topic>
          <Topic title="What is encrypted">
            <p>Station coordinates are the only field stored encrypted in the database. Passwords are stored as one-way hashes. Access to all other data is limited by sign-in and by station.</p>
            <p>A farmer's phone number is shown whole only to the station's own staff and national superadmins. It is masked in every export and never written to the audit trail.</p>
          </Topic>
          <Topic title="Sign-in and sessions">
            <p>{national
              ? "You sign in with your email and password, then a one-time code sent to your email. A code works once and expires after a few minutes."
              : "You sign in with your email, password and station code, then a one-time code sent to your email. A code works once and expires after a few minutes."}{" "}
              You are signed out when you close the browser tab, when you choose Sign out, or when the session reaches its time limit.</p>
            <p>A forgotten password is reset from the sign-in page with a code sent to your email. Changing or resetting a password ends every other sign-in of the account, and the account's email is told of the change.</p>
          </Topic>
          <Topic title="The audit trail">
            <p>Adding, changing and deleting station data, file uploads, bulk deletes, exports, calibration reverts, bulletins sent by hand and sign-ins are recorded with the account, the time and the network address. A change is recorded with the old and the new value; a password, a coordinate or a phone number is only recorded as changed. Entries cannot be changed or removed.</p>
          </Topic>
          <Topic title="Access levels">
            <p>Level 1, national superadmin: every station, and the registers of stations, accounts and metrics. Level 2, station administrator: everything at one station, including deleting records, reverting calibrations, the station set-up (sensors, operators, baselines) and sending the farmers' bulletin by hand. Level 3, station data officer: adds and edits records, uploads files, logs calibrations and registers farmers. Level 4: reads and exports only.</p>
          </Topic>
          <Topic title="Farmers and SMS">
            <p>Farmers have no account. Station staff register them, with their consent, and each farmer then gets SMS from the station in English, Shona or Ndebele: a welcome, every Monday at 06:00 the rain and temperature of the week against the normal, and an alert when an extreme weather event of High or Extreme severity is recorded. A bulletin always covers the last complete week, Monday to Sunday, whichever day it is sent, so a farmer gets each week's bulletin once, and each event's alert once. When a farmer asks to stop, clear Receives SMS: nothing more is sent.</p>
            <p>Once the server has a number for farmers' texts, a farmer can text it: STOP stops the SMS, START brings them back, RAIN is answered with last week's rain and temperature, and HELP or any other text with the words a farmer can send. A few answers a day at most go to one farmer. Every text and what was done is listed under Texts from farmers.</p>
            <p>Sent means the SMS company accepted a message; Delivered, that it reported the message on the farmer's phone. A farmer counts as reached, in the Rural adoption report and its target, once one message is delivered. Every Friday the station administrators and data officers get an email when no rain or temperature reading has been entered that week, because a week without readings sends no bulletin.</p>
          </Topic>
          <Topic title="Readings that are checked">
            <p>A reading is refused when its unit is not the unit of the metric, its value is outside the valid range, its time is in the future or before the station was commissioned, its sensor is retired or faulty, or the same reading already exists. The same rules apply to a form and to every row of an upload file.</p>
          </Topic>
          <Topic title="Reports and exports">
            <p>Click a column header to sort a list by it: once for lowest or A first, twice for highest first, three times for the usual order. Every list can be exported as CSV, Excel or PDF with the filters and the order in use. A file holds only the records your account may see, and it stays available under Reports until it expires.</p>
          </Topic>
          <Topic title="Keyboard">
            <p>Press Ctrl+K to jump to any screen by name, Ctrl+B to fold the sidebar to icons, and ? to see every shortcut. Every chart has a Table view with the same values.</p>
          </Topic>
        </div>
      </Card>

      <Card title="About the Climate Dashboard">
        <div className="flex flex-wrap items-center gap-5">
          <ZchpcLogo className="h-28" />
          <div className="min-w-[16rem] flex-1 space-y-1.5 text-ink-2">
            <p>The Climate Dashboard is the climate and environmental monitoring system of the <span className="font-semibold text-ink">{OWNER}</span> (DCCES).</p>
            <p>It is developed and hosted by <span className="font-semibold text-ink">ZCHPC</span>.</p>
            <p className="text-xs text-muted">Release {import.meta.env.VITE_RELEASE || "dev"}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
