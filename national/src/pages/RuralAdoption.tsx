/**
 * Rural adoption (rural pilot): GET /api/analysis/adoption/?days=30[&rural=true&province=]
 * Who is using the system in rural areas, station by station: farmers registered, reached (an SMS
 * reported delivered to their phone) and texting back, station staff who signed in, and readings people
 * entered (forms and uploads, not telemetry). The server lists the stations with the fewest farmers
 * first: those are the ones to follow up. The target counts farmers reached; it and the deadline are
 * server settings (RURAL_PILOT_TARGET_FARMERS, RURAL_PILOT_DEADLINE).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CalendarX, KeyRound, MessageSquare, MessageSquareReply, PencilLine, RadioTower, Users } from "lucide-react";
import { PlainTable } from "../components/DataTable";
import { Badge, Card, EmptyState, ErrorState, FilterBar, KpiCard, KpiGrid, Notice, PageHeader, SelectFilter, Spinner, cx } from "../components/ui";
import { useFetch } from "../hooks/useResource";
import { fmtDate, fmtDateTime, fmtInt, fmtPct } from "../lib/format";
import { pctTone } from "../lib/tones";
import type { Adoption, SmsSetup } from "../services/analysis";
import { PROVINCE_OPTIONS, StationLink, ToggleFilter } from "./shared";

const PERIODS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];
const DEFAULT_DAYS = "30";

export default function RuralAdoption() {
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [ruralOnly, setRuralOnly] = useState(true);
  const [province, setProvince] = useState("");
  const query = useFetch<Adoption>("/analysis/adoption/", { days, province, rural: ruralOnly ? "true" : "" });
  const setup = useFetch<SmsSetup>("/farmers/setup/").data;
  const data = query.data;
  const filtered = Boolean(province || !ruralOnly || days !== DEFAULT_DAYS);
  const refreshing = query.isFetching && !query.isLoading;

  return (
    <div>
      <PageHeader title="Rural adoption"
        description="Who is using the system in rural areas: farmers reached by SMS and texting back, station staff signing in, and readings entered by people. A farmer is reached once the SMS company reports a message delivered to their phone. The stations with the fewest farmers are listed first: follow those up." />
      <FilterBar onReset={filtered ? () => { setDays(DEFAULT_DAYS); setRuralOnly(true); setProvince(""); } : undefined}>
        <SelectFilter id="adoption-period" label="Period" value={days} onChange={setDays} options={PERIODS} allLabel={null} />
        <SelectFilter id="adoption-province" label="Province" value={province} onChange={setProvince} options={PROVINCE_OPTIONS} allLabel="All provinces" className="min-w-[14rem]" />
        <ToggleFilter id="adoption-rural" label="Rural pilot stations only" checked={ruralOnly} onChange={setRuralOnly} />
      </FilterBar>

      {query.error ? <div className="card"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>
        : !data ? <div className="card"><Spinner /></div>
        : (
          <div className={cx("space-y-4 transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing}>
            <KpiGrid count={8}>
              <KpiCard label="Farmers reached" value={fmtInt(data.totals.farmers_reached)} icon={Users}
                tone={data.target.farmers ? pctTone(data.target.farmers_pct, 100, 60) : "info"}
                detail={`${data.target.farmers
                  ? `${fmtPct(data.target.farmers_pct)} of the target of ${fmtInt(data.target.farmers)}.`
                  : "No target set (RURAL_PILOT_TARGET_FARMERS)."} ${fmtInt(data.totals.farmers_active)} receive SMS, ${fmtInt(data.totals.farmers_new)} new in the period.`} />
              <KpiCard label="Days to the deadline" value={fmtInt(data.target.days_left)} icon={CalendarClock}
                tone={data.target.days_left <= 7 ? "warn" : "info"} detail={`Deadline ${fmtDate(data.target.deadline)}`} />
              <KpiCard label="Stations in use" value={`${fmtInt(data.totals.stations_in_use)} of ${fmtInt(data.totals.stations)}`} icon={RadioTower}
                tone={data.totals.stations && data.totals.stations_in_use === data.totals.stations ? "good" : "warn"}
                detail="Staff signed in, readings were entered or SMS reached farmers in the period" />
              <KpiCard label="Farmers who texted" value={fmtInt(data.totals.farmers_texted)} icon={MessageSquareReply} tone="info"
                detail="Sent RAIN, STOP, START or a question to the system's number, in the period" />
              <KpiCard label="SMS delivered" value={fmtInt(data.totals.sms_delivered)} icon={MessageSquare}
                tone={data.totals.sms_failed || data.totals.sms_undelivered ? "warn" : data.totals.sms_delivered ? "good" : "neutral"}
                detail={`${fmtInt(data.totals.sms_sent)} sent: ${fmtInt(data.totals.sms_awaiting)} awaiting a delivery report, ${fmtInt(data.totals.sms_undelivered)} not delivered. ${fmtInt(data.totals.sms_failed)} could not be sent.`} />
              <KpiCard label="Bulletins at risk" value={fmtInt(data.totals.stations_bulletin_at_risk)} icon={CalendarX}
                tone={data.totals.stations_bulletin_at_risk ? "warn" : "good"}
                detail={`Stations with farmers and no reading this week: no bulletin on ${fmtDate(data.next_bulletin.sends_on)} unless readings are entered by Sunday`} />
              <KpiCard label="Station staff who signed in" value={fmtInt(data.totals.accounts_signed_in)} icon={KeyRound} tone="info"
                detail="Different station accounts, in the period" />
              <KpiCard label="Readings entered by people" value={fmtInt(data.totals.readings_entered)} icon={PencilLine} tone="info"
                detail="Through the forms and file uploads, in the period" />
            </KpiGrid>
            {setup && (!setup.real_sms || setup.open > 0) && (
              <Notice tone="warn" title={setup.real_sms ? `${setup.open} still to do for farmers' SMS` : "No real phone receives these SMS yet"}>
                {setup.real_sms ? "" : "SMS go to the development simulator or nowhere, so farmers reached here are not real phones. "}
                <Link to="/sms-setup" className="font-semibold underline">SMS setup</Link> lists what is in place and what is still needed, and who does it.
              </Notice>
            )}
            {data.totals.sms_awaiting > 0 && data.totals.sms_delivered === 0 && data.totals.sms_undelivered === 0 && (
              <Notice tone="warn" title="No delivery report has come back">
                {fmtInt(data.totals.sms_awaiting)} SMS were accepted by the SMS company, but none was reported delivered, so no farmer counts as reached yet.
                Check that the company sends its delivery reports to the system: the server administrator gets the address with manage.py sms_addresses (RUNBOOK section 11).
              </Notice>
            )}
            {data.totals.sms_failed > 0 && (
              <Notice tone="warn" title="Some SMS could not be sent">
                Open <Link to="/sms" className="font-semibold underline">SMS to farmers</Link> and filter on Failed to read why. Until an SMS provider is configured on the server, every message fails with that reason.
              </Notice>
            )}

            <Card title="Use by station"
              description={`${fmtDate(data.period.from)} to ${fmtDate(data.period.to)}. Farmers are counted as registered today; the other figures are for the period.`}
              padded={false}>
              {data.results.length === 0
                ? <EmptyState title={ruralOnly ? "No station is marked as a rural pilot station" : "No stations match these filters"}
                    hint={ruralOnly ? "Open Stations, edit a station and tick Rural pilot station." : "Change or clear the filters to see more."} />
                : (
                  <div className="p-4">
                    <PlainTable caption="Rural adoption by station" rows={data.results} rowKey={(row) => row.station} scroll={false}
                      columns={[
                        { key: "station", header: "Station", cell: (row) => <StationLink id={row.station} code={row.station_code} name={row.station_name} stacked /> },
                        { key: "use", header: "In use", cell: (row) => (
                          <span className="flex flex-wrap gap-1">
                            {row.in_use ? <Badge tone="good">In use</Badge> : <Badge tone="warn">Not in use</Badge>}
                            {row.is_rural && <Badge tone="info">Rural</Badge>}
                          </span>
                        ) },
                        { key: "farmers", header: "Farmers", cell: (row) => (
                          <span className="block whitespace-nowrap">
                            <span className="font-semibold text-ink">{fmtInt(row.farmers_reached)}</span> reached of {fmtInt(row.farmers_active)}
                            <span className="block text-xs text-muted">{fmtInt(row.farmers_new)} new · {fmtInt(row.farmers_opted_out)} stopped · {fmtInt(row.farmers_texted)} texted</span>
                          </span>
                        ) },
                        { key: "sms", header: "SMS in the period", cell: (row) => (
                          <span className="flex flex-wrap gap-1">
                            <Badge tone={row.sms_delivered ? "good" : "neutral"}>{fmtInt(row.sms_delivered)} delivered</Badge>
                            {row.sms_awaiting > 0 && <Badge tone="info">{fmtInt(row.sms_awaiting)} awaiting report</Badge>}
                            {row.sms_undelivered > 0 && <Badge tone="warn">{fmtInt(row.sms_undelivered)} not delivered</Badge>}
                            {row.sms_failed > 0 && <Badge tone="crit">{fmtInt(row.sms_failed)} failed</Badge>}
                            {row.sms_queued > 0 && <Badge tone="neutral">{fmtInt(row.sms_queued)} queued</Badge>}
                          </span>
                        ) },
                        { key: "staff", header: "Staff signed in", cell: (row) => (
                          <span className="block whitespace-nowrap">
                            {fmtInt(row.accounts_signed_in)} of {fmtInt(row.accounts)} accounts
                            <span className="block text-xs text-muted">{row.last_sign_in_at ? `Last ${fmtDateTime(row.last_sign_in_at)}` : "Never signed in"}</span>
                          </span>
                        ) },
                        { key: "readings", header: "Readings entered", align: "right", cell: (row) => fmtInt(row.readings_entered) },
                        { key: "week", header: "This week", cell: (row) => (
                          <span className="block whitespace-nowrap">
                            {fmtInt(row.readings_this_week)} readings
                            {row.bulletin_at_risk && <span className="mt-1 block"><Badge tone="warn">No bulletin yet</Badge></span>}
                          </span>
                        ) },
                      ]} />
                  </div>
                )}
            </Card>
            <p className="text-xs text-muted">
              The farmer lists, the SMS and the texts from farmers export to CSV, Excel and PDF from their own screens; the sign-ins are in the Audit trail.
              This week runs from {fmtDate(data.next_bulletin.from)} to {fmtDate(data.next_bulletin.to)}; its readings go into the bulletin of {fmtDate(data.next_bulletin.sends_on)}.
            </p>
          </div>
        )}
    </div>
  );
}
