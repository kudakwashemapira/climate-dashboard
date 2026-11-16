/**
 * SMS setup (rural pilot): GET /api/farmers/setup/
 * What is in place, and what is still needed, for farmers to get real SMS: the SMS company and its
 * account, the sender, the number farmers text, the addresses the company calls back, whether delivery
 * reports and texts arrive, the test-phone limit, the languages, the target, the mail server, and the
 * rural stations' farmers and readings. The server works every line out from its own settings and
 * records (farmers/setup.py); keys and tokens are never sent, only whether they are set.
 * Below it, the pilot settings a superadmin changes here (PATCH /api/farmers/pilot/): the target and the
 * deadline of the adoption report, and the languages a native speaker has checked.
 */
import { useState, type FormEvent } from "react";
import { CheckCircle2, ListChecks, Save } from "lucide-react";
import { useToast } from "../components/Toast";
import { Checkbox } from "../components/shadcn/checkbox";
import { Badge, Button, Card, ErrorState, Field, Notice, PageHeader, Spinner, cx, type Tone } from "../components/ui";
import { useAction, useFetch } from "../hooks/useResource";
import type { PilotSettings, SetupState, SmsSetup as Setup } from "../services/analysis";
import { describeError, send } from "../services/http";
import type { Language } from "../services/types";

const STATE: Record<SetupState, { label: string; tone: Tone }> = {
  todo: { label: "To do", tone: "crit" },
  check: { label: "Check", tone: "warn" },
  done: { label: "Done", tone: "good" },
  note: { label: "Note", tone: "neutral" },
};

const WHERE: Record<Setup["mode"], string> = {
  none: "nowhere: no SMS company is set",
  console: "to the worker log only",
  simulator: "to the development SMS simulator, which stands in for an SMS company",
  company: "to an SMS company",
};

export default function SmsSetup() {
  const query = useFetch<Setup>("/farmers/setup/");
  const data = query.data;
  const refreshing = query.isFetching && !query.isLoading;
  return (
    <div>
      <PageHeader title="SMS setup"
        description="What is in place, and what is still needed, for farmers to get real SMS from their station. Worked out by the server from its own settings and records; keys and tokens are never shown, only whether they are set." />
      {query.error ? <div className="card"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>
        : !data ? <div className="card"><Spinner /></div>
        : (
          <div className={cx("space-y-4 transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing}>
            {data.real_sms
              ? <Notice tone={data.open ? "warn" : "good"} title={data.open ? `${data.open} to do` : "Ready"}>
                  {data.open ? "Farmers' SMS go to a real SMS company; the items marked To do still stop them from working fully." : "Farmers' SMS go to a real SMS company and every item is in place."}
                </Notice>
              : <Notice tone="warn" title="No real phone receives these SMS yet">
                  This {data.environment} server sends farmers' SMS {WHERE[data.mode]}.
                  {data.open ? ` ${data.open} items below are marked To do.` : ""}
                </Notice>}
            <Card title="Checklist" description="In the order a message travels: from the SMS company to the farmer's phone and back." padded={false}>
              <ul className="divide-y divide-line">
                {data.items.map((item) => (
                  <li key={item.key} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                    <span className="w-20 shrink-0"><Badge tone={STATE[item.state].tone}>{STATE[item.state].label}</Badge></span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{item.label}</span>
                      <span className="block text-sm text-ink-2">{item.detail}</span>
                      {item.owner && <span className="mt-0.5 block text-xs text-muted">Who: {item.owner}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <PilotSettingsCard />
            <p className="flex items-start gap-1.5 text-xs text-muted">
              {data.open ? <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
              The server administrator's steps are in backend/docs/RUNBOOK.md section 11; manage.py sms_addresses prints the two addresses to give the SMS company.
            </p>
          </div>
        )}
    </div>
  );
}

const CHECKED: Array<{ code: Language; text: string }> = [
  { code: "sn", text: "A Shona speaker has checked the Shona texts" },
  { code: "nd", text: "An Ndebele speaker has checked the Ndebele texts" },
];

/** The target, the deadline and the checked languages: they apply at once, and each change is in the audit trail. */
function PilotSettingsCard() {
  const toast = useToast();
  const query = useFetch<PilotSettings>("/farmers/pilot/");
  const [edited, setEdited] = useState<{ target: string; deadline: string; languages: Language[] } | null>(null);
  const loaded = query.data;
  const form = edited ?? (loaded ? { target: loaded.target_farmers ? String(loaded.target_farmers) : "", deadline: loaded.deadline ?? "", languages: loaded.reviewed_languages } : null);
  const save = useAction<PilotSettings, NonNullable<typeof form>>((values) => send("PATCH", "/farmers/pilot/", {
    target_farmers: values.target.trim() ? Number(values.target) : null,
    deadline: values.deadline || null,
    // a language the server setting names stays checked whatever is sent
    reviewed_languages: values.languages.filter((code) => !loaded?.server_reviewed_languages.includes(code)),
  }));
  if (query.error) return <div className="card"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>;
  if (!form || !loaded) return <div className="card"><Spinner /></div>;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await save.mutateAsync(form);
      setEdited(null);
      toast.success("Pilot settings saved. They apply at once.");
    } catch (error) {
      toast.error(describeError(error));
    }
  };
  const toggle = (code: Language, on: boolean) =>
    setEdited({ ...form, languages: on ? [...form.languages, code] : form.languages.filter((l) => l !== code) });

  return (
    <Card title="Pilot settings" description="Changed here, they apply at once: the target and deadline of the Rural adoption report, and the languages whose SMS now go out in that language instead of English. Each change is in the audit trail.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Target: farmers reached" htmlFor="pilot-target" hint="Receiving SMS, with at least one message reported delivered. Empty: no target.">
            <input id="pilot-target" type="number" min={1} max={1000000} className="input" value={form.target}
              onChange={(e) => setEdited({ ...form, target: e.target.value })} />
          </Field>
          <Field label="Deadline" htmlFor="pilot-deadline" hint="The day the target is measured on.">
            <input id="pilot-deadline" type="date" className="input" value={form.deadline} onChange={(e) => setEdited({ ...form, deadline: e.target.value })} />
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold text-ink">Translations checked by a native speaker</legend>
          {CHECKED.map(({ code, text }) => {
            const fixed = loaded.server_reviewed_languages.includes(code);
            return (
              <label key={code} className="flex items-start gap-2 text-sm text-ink">
                <Checkbox className="mt-0.5" checked={fixed || form.languages.includes(code)} disabled={fixed}
                  onCheckedChange={(value) => toggle(code, value === true)} />
                <span>{text}{fixed && <span className="block text-xs text-muted">Set on the server (SMS_REVIEWED_LANGUAGES).</span>}</span>
              </label>
            );
          })}
          <p className="text-xs text-muted">Until a language is checked, farmers who chose it get the English text. Tick it only after the speaker's corrections are in the release.</p>
        </fieldset>
        <Button type="submit" variant="primary" loading={save.isPending} icon={<Save className="h-4 w-4" aria-hidden />} disabled={edited === null}>Save</Button>
      </form>
    </Card>
  );
}
