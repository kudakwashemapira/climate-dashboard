/**
 * The rural pilot: farmers registered at a station and the SMS they receive (farmers/ in the backend).
 *   /api/farmers/farmers/                    register, list, edit, remove; export, template, upload
 *   POST /api/farmers/farmers/send_bulletin/ this week's bulletin, now: a count first, then the sending
 *   /api/farmers/messages/                   every SMS sent, read-only, with export; Delivered once the provider reports it
 *   /api/farmers/incoming/                   every text farmers sent (STOP, START, RAIN, HELP) and what was done
 *
 * A farmer has no account. Station staff register the farmers of their area with the farmer's consent;
 * each one then gets a welcome SMS, the weekly bulletin of the station's rain and temperature, and
 * extreme weather alerts. A farmer can text STOP, START, RAIN or HELP to the system's number and is answered.
 * Levels 1 to 3 register, levels 1 and 2 remove farmers and send the bulletin.
 * The phone number is shown whole here, to the station's own staff, and masked in every export.
 */
import { useState } from "react";
import { Send } from "lucide-react";
import { ConfirmDialog } from "../components/Dialog";
import type { FieldErrors, FormData } from "../components/FormDialog";
import { ResourcePage, type ResourceConfig } from "../components/ResourcePage";
import { useToast } from "../components/Toast";
import { Badge, Button } from "../components/ui";
import { useAction } from "../hooks/useResource";
import { fmtDate, fmtDateTime, fmtInt } from "../lib/format";
import { INCOMING_TONE, SMS_TONE } from "../lib/tones";
import type { SendBulletinResult } from "../services/analysis";
import { describeError, send, withQuery } from "../services/http";
import { canAdminister, useSession } from "../services/session";
import {
  INCOMING_KINDS, LANGUAGES, SMS_KINDS, SMS_STATUSES, options, type Farmer, type IncomingKind, type IncomingSms, type SmsMessage, type SmsStatus,
} from "../services/types";
import { useFileUpload, type FileUploadConfig } from "./bulk";
import { useStationScope, type ModuleProps } from "./common";

const FARMERS_UPLOAD: FileUploadConfig = {
  path: "/farmers/farmers/", title: "farmers", name: "farmers", rowNoun: "farmers",
  columns: [
    { column: "Full Name *", rule: "The name the farmer uses." },
    { column: "Phone *", rule: "A Zimbabwe mobile number, for example 0771 234 567. A number is registered once." },
    { column: "Language", rule: "English, Shona or Ndebele (or en, sn, nd). Empty means English." },
    { column: "Village", rule: "The village or ward." },
    { column: "Main Crops", rule: "Optional, for example Maize, groundnuts." },
    { column: "Consent Given On *", rule: "The day the farmer agreed to receive SMS, written YYYY-MM-DD. Not in the future." },
    { column: "Receives SMS", rule: "yes or no. Empty means yes. Every farmer saved with yes gets a welcome SMS at once." },
  ],
};

export const LANGUAGE_NAME: Record<string, string> = Object.fromEntries(LANGUAGES.map((l) => [l.value, l.label]));
const none = <span className="text-muted">not recorded</span>;

/** The same writing rules as the server (farmers/models.py normalise_phone), so the reason shows beside the field. */
export function normalisePhone(raw: string): string {
  let phone = raw.replace(/[\s\-().]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (phone.startsWith("0")) phone = `+263${phone.slice(1)}`;
  else if (phone.startsWith("263")) phone = `+${phone}`;
  else if (phone.startsWith("7") && phone.length === 9) phone = `+263${phone}`;
  return phone;
}

function checkPhone(form: FormData): FieldErrors {
  const raw = String(form.phone ?? "").trim();
  return raw && !/^\+2637\d{8}$/.test(normalisePhone(raw))
    ? { phone: "Use a Zimbabwe mobile number, for example 0771 234 567 or +263 771 234 567." }
    : {};
}

/**
 * "Send this week's bulletin": the server first says how many farmers would get it, then sends only
 * after the confirmation. Shown to station administrators and superadmins, for one known station.
 */
export function SendBulletinButton({ station }: { station: number | null }) {
  const session = useSession();
  const toast = useToast();
  const [asked, setAsked] = useState<SendBulletinResult | null>(null);
  const [counting, setCounting] = useState(false);
  // The station is named in the address, as for a file upload; the server ignores it for a station account.
  const path = withQuery("/farmers/farmers/send_bulletin/", { station });
  const sendNow = useAction<SendBulletinResult, void>(() => send("POST", path, { confirm: true }));
  if (!canAdminister(session?.user) || station === null) return null;

  const ask = async () => {
    setCounting(true);
    try {
      const reply = await send<SendBulletinResult>("POST", path, {});
      if (reply.farmers === 0) toast.error("No farmer of this station receives SMS yet. Register farmers first.");
      else setAsked(reply);
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setCounting(false);
    }
  };
  const confirm = async () => {
    try {
      const done = await sendNow.mutateAsync();
      if (done.skipped) toast.error(done.skipped); else toast.success(done.detail);
      setAsked(null);
    } catch (error) {
      toast.error(describeError(error));
    }
  };
  return (
    <>
      <Button icon={<Send className="h-4 w-4" aria-hidden />} loading={counting} onClick={ask}>Send this week's bulletin</Button>
      <ConfirmDialog open={asked !== null} danger={false} confirmLabel="Send the bulletin" busy={sendNow.isPending}
        title={`Send the bulletin to ${fmtInt(asked?.farmers ?? 0)} farmers?`}
        onConfirm={confirm} onClose={() => setAsked(null)}>
        <p>The bulletin gives the rain and temperature measured at the station last week, Monday to Sunday, against the normal, and the weather alerts in force.
          Each farmer gets it in their own language.</p>
        <p>It covers the same week whichever day it is sent, so a farmer who already has it, from Monday's run or an earlier send, does not get it again.
          Readings from this week go into next Monday's bulletin.</p>
      </ConfirmDialog>
    </>
  );
}

// ---- farmers ------------------------------------------------------------------------------------
export function FarmersScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  const upload = useFileUpload(FARMERS_UPLOAD, station);
  const config: ResourceConfig<Farmer> = {
    path: "/farmers/farmers/",
    sortable: ["name", "language", "crops", "sms", "registered", "station"],
    title: "Farmers",
    description: "Farmers of the area the station serves. Each gets a welcome SMS, then every Monday the rain and temperature measured at the station, and an alert when a serious extreme weather event is recorded. Register a farmer only with their consent; when a farmer asks to stop, clear Receives SMS (a farmer who texts STOP is stopped by the system).",
    noun: "farmer",
    exportName: "farmers",
    bulkDelete: true,
    headerActions: embedded ? undefined : <>{upload.button}<SendBulletinButton station={s.pick ? null : s.stationId} /></>,
    baseParams: s.baseParams,
    describe: (row) => `farmer ${row.full_name}`,
    columns: [
      { key: "name", header: "Farmer", cell: (row) => (
        <span className="block">
          <span className="font-semibold text-ink">{row.full_name}</span>
          <span className="block text-xs text-ink-2">{row.village ?? "village not recorded"}</span>
        </span>
      ) },
      ...s.columns<Farmer>(),
      { key: "phone", header: "Phone", cell: (row) => <span className="whitespace-nowrap">{row.phone}</span> },
      { key: "language", header: "Language", cell: (row) => LANGUAGE_NAME[row.language] ?? row.language },
      { key: "crops", header: "Main crops", cell: (row) => row.main_crops ?? none },
      { key: "sms", header: "Receives SMS", cell: (row) => (row.is_active
        ? <Badge tone="good">Yes</Badge>
        : <span><Badge tone="neutral">Stopped</Badge>{row.opted_out_at && <span className="mt-0.5 block text-xs text-muted">{fmtDate(row.opted_out_at)}</span>}</span>) },
      { key: "registered", header: "Registered", cell: (row) => <span className="whitespace-nowrap">{fmtDate(row.created_at)}</span> },
    ],
    filters: [
      ...s.filters(),
      { name: "search", label: "Name, village or phone", type: "text", placeholder: "Search" },
      { name: "language", label: "Language", type: "select", options: LANGUAGES },
      { name: "is_active", label: "Receives SMS", type: "select", options: [{ value: "true", label: "Yes" }, { value: "false", label: "Stopped" }] },
    ],
    fields: [
      ...s.fields(),
      { name: "full_name", label: "Full name", required: true, maxLength: 120 },
      { name: "phone", label: "Mobile number", required: true, maxLength: 24, placeholder: "0771 234 567", hint: "A Zimbabwe mobile number. It is saved as +263…, and each number is registered once." },
      { name: "language", label: "SMS language", type: "select", required: true, options: LANGUAGES, hint: "Messages to this farmer are written in this language once its translation is reviewed, in English until then." },
      { name: "village", label: "Village or ward", maxLength: 120 },
      { name: "main_crops", label: "Main crops", maxLength: 120, placeholder: "Maize, groundnuts" },
      { name: "consent_given_on", label: "Consent to SMS given on", type: "date", required: true, hint: "The day the farmer agreed to receive the messages." },
      { name: "is_active", label: "Receives SMS", type: "checkbox", wide: true, hint: "Clear it when the farmer asks to stop. The farmer stays on the list and gets nothing more. A farmer who texts STOP or START is changed by the system." },
    ],
    defaults: { language: "en", is_active: true },
    toPayload: s.withStation,
    validate: (form) => checkPhone(form),
    emptyHint: "Register the first farmer, or upload a list made from the template.",
  };
  return <><ResourcePage config={config} embedded={embedded} />{upload.dialog}</>;
}

// ---- SMS ----------------------------------------------------------------------------------------
export function SmsMessagesScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  const config: ResourceConfig<SmsMessage> = {
    path: "/farmers/messages/",
    sortable: ["queued", "farmer", "kind", "language", "status", "station"],
    title: "SMS to farmers",
    description: "Every message sent to a farmer, newest first: welcomes, weekly bulletins, alerts and answers to farmers' texts. Sent means the SMS company accepted the message; Delivered, that it reported the message on the farmer's phone. A message that could not be sent or delivered says why.",
    noun: "SMS",
    exportName: "sms_to_farmers",
    canCreate: false,
    canEdit: false,
    canDelete: false,
    baseParams: s.baseParams,
    describe: (row) => `the ${row.kind.toLowerCase()} SMS of ${fmtDateTime(row.created_at)}`,
    columns: [
      { key: "queued", header: "Queued (CAT)", cell: (row) => <span className="whitespace-nowrap">{fmtDateTime(row.created_at)}</span> },
      ...s.columns<SmsMessage>(),
      // No farmer: one removed since, or an answer to a number not registered (the consent question of JOIN)
      { key: "farmer", header: "Farmer", cell: (row) => row.farmer_name ?? <span className="text-muted">no farmer on record</span> },
      { key: "kind", header: "Kind", cell: (row) => row.kind },
      { key: "language", header: "Language", cell: (row) => LANGUAGE_NAME[row.language] ?? row.language },
      { key: "status", header: "Status", cell: (row) => (
        <span className="block">
          <Badge tone={SMS_TONE[row.status]}>{row.status}</Badge>
          {row.delivered_at && <span className="mt-1 block whitespace-nowrap text-xs text-muted">{fmtDateTime(row.delivered_at)}</span>}
          {row.error && <span className="mt-1 block max-w-xs text-xs text-ink-2">{row.error}</span>}
        </span>
      ) },
      { key: "text", header: "Message", cell: (row) => <span className="block max-w-md text-sm text-ink-2">{row.body}</span> },
    ],
    filters: [
      ...s.filters(),
      { name: "kind", label: "Kind", type: "select", options: options(SMS_KINDS) },
      { name: "status", label: "Status", type: "select", options: options(SMS_STATUSES) },
      { name: "language", label: "Language", type: "select", options: LANGUAGES },
      { name: "sent_from", label: "Queued from", type: "date" },
      { name: "sent_to", label: "Queued to", type: "date" },
    ],
    fields: [],
    emptyHint: "Messages appear here once farmers are registered.",
  };
  return <ResourcePage config={config} embedded={embedded} />;
}

// ---- texts from farmers -------------------------------------------------------------------------
/** The word a farmer sends for each kind of text (farmers/messages.py KEYWORDS has the Shona and Ndebele words too). */
const ASKED: Record<IncomingKind, string> = { Weather: "RAIN", Stop: "STOP", Start: "START", Help: "HELP", Join: "JOIN", Yes: "YES", Other: "Other text" };

export function IncomingSmsScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  const config: ResourceConfig<IncomingSms> = {
    path: "/farmers/incoming/",
    sortable: ["received", "station", "farmer", "keyword", "outcome"],
    title: "Texts from farmers",
    description: "What farmers sent to the system's number, newest first, and what the system did. STOP stops their SMS, START brings them back, RAIN is answered with last week's rain and temperature, and any other text with the words they can send. Where joining by SMS is on, a newcomer's JOIN and YES appear too; a farmer who joined that way is listed under Farmers until you add their name. Read the other texts: they are the farmers' own questions.",
    noun: "text",
    exportName: "texts_from_farmers",
    canCreate: false,
    canEdit: false,
    canDelete: false,
    baseParams: s.baseParams,
    describe: (row) => `the text of ${fmtDateTime(row.received_at)}`,
    columns: [
      { key: "received", header: "Received (CAT)", cell: (row) => <span className="whitespace-nowrap">{fmtDateTime(row.received_at)}</span> },
      // A text from a number nobody registered has no station: only superadmins see it.
      ...(s.pick ? [{ key: "station", header: "Station", cell: (row: IncomingSms) => (row.station === null ? <span className="text-muted">none</span> : s.code(row.station)) }] : []),
      { key: "farmer", header: "Farmer", cell: (row) => row.farmer_name ?? <span className="text-muted">{row.station === null ? "number not registered" : "removed"}</span> },
      { key: "keyword", header: "Asked for", cell: (row) => <Badge tone={INCOMING_TONE[row.keyword]}>{ASKED[row.keyword]}</Badge> },
      { key: "text", header: "Text", cell: (row) => <span className="block max-w-sm text-sm text-ink">{row.body || <span className="text-muted">empty</span>}</span> },
      { key: "outcome", header: "What the system did", cell: (row) => (
        <span className="block max-w-sm">
          <span className="block text-sm text-ink-2">{row.outcome}</span>
          {row.reply_status && (
            <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">Answer <Badge tone={SMS_TONE[row.reply_status as SmsStatus]}>{row.reply_status}</Badge></span>
          )}
        </span>
      ) },
    ],
    filters: [
      ...s.filters(),
      { name: "keyword", label: "Asked for", type: "select", options: INCOMING_KINDS },
      { name: "received_from", label: "Received from", type: "date" },
      { name: "received_to", label: "Received to", type: "date" },
    ],
    fields: [],
    emptyHint: "Texts appear here once farmers send STOP, START, RAIN or HELP to the system's number.",
  };
  return <ResourcePage config={config} embedded={embedded} />;
}
