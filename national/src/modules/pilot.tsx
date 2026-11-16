/**
 * The rural pilot at a glance: GET /api/analysis/adoption/ (rural pilot stations, or the station of a
 * station account, which the server scopes). Farmers reached against the target, the days left to the
 * deadline, and whether next Monday's bulletin can go out. On the national dashboard and the station home.
 */
import { useNavigate } from "react-router-dom";
import { CalendarClock, Plus, Target, Users } from "lucide-react";
import { Badge, Button, Card, cx, type Tone } from "../components/ui";
import { useFetch } from "../hooks/useResource";
import { fmtDate, fmtInt, fmtPct } from "../lib/format";
import type { Adoption } from "../services/analysis";
import { canWrite, useSession } from "../services/session";

function DaysLeft({ days, deadline }: { days: number; deadline: string }) {
  const tone: Tone = days <= 0 ? "crit" : days <= 7 ? "warn" : "info";
  return (
    <Badge tone={tone} icon={false}>
      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
      {days <= 0 ? `Deadline ${fmtDate(deadline)} reached` : `${fmtInt(days)} ${days === 1 ? "day" : "days"} to ${fmtDate(deadline)}`}
    </Badge>
  );
}

/** A share of the target as a bar; the figure is always written beside it. */
function TargetBar({ pct }: { pct: number }) {
  const shown = Math.min(100, pct);
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-label="Farmers reached, share of the target"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(shown)}>
        <div className={cx("h-full rounded-full transition-[width]", pct >= 100 ? "bg-good" : pct >= 60 ? "bg-accent" : "bg-warn")}
          style={{ width: `${Math.max(2, shown)}%` }} />
      </div>
      <span className="w-14 text-right text-sm font-semibold text-ink">{fmtPct(pct)}</span>
    </div>
  );
}

/**
 * National: the rural pilot stations together, against the target. Station: the station's own farmers,
 * shown only at a rural pilot station or one with farmers. The card is extra: while it loads, or if it
 * cannot be loaded, the page shows without it.
 */
export function PilotProgressCard({ scope }: { scope: "national" | "station" }) {
  const navigate = useNavigate();
  const session = useSession();
  const { data } = useFetch<Adoption>("/analysis/adoption/", scope === "national" ? { rural: "true" } : {});
  if (!data) return null;
  const { target, totals, next_bulletin: bulletin } = data;

  if (scope === "station") {
    const row = data.results[0];
    if (!row || (!row.is_rural && row.farmers_active === 0)) return null;
    return (
      <Card title="Rural pilot at this station"
        description={`Farmers near the station get its weather by SMS. ${target.farmers
          ? `The national target is ${fmtInt(target.farmers)} farmers reached by ${fmtDate(target.deadline)}.`
          : `The pilot runs to ${fmtDate(target.deadline)}.`}`}
        actions={<DaysLeft days={target.days_left} deadline={target.deadline} />}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-tint text-info" aria-hidden><Users className="h-5 w-5" /></span>
            <div>
              <p className="text-2xl font-semibold leading-tight text-ink">{fmtInt(row.farmers_reached)} <span className="text-base font-medium text-ink-2">{row.farmers_reached === 1 ? "farmer" : "farmers"} reached</span></p>
              <p className="text-xs text-ink-2">of {fmtInt(row.farmers_active)} receiving SMS. Reached: an SMS was reported delivered to their phone.</p>
            </div>
          </div>
          <Button icon={<Users className="h-4 w-4" aria-hidden />} onClick={() => navigate("/farmers")}>Farmers</Button>
        </div>
        <div className={cx("mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md px-3.5 py-3", row.bulletin_at_risk ? "bg-warn-tint" : "bg-good-tint")}>
          <p className={cx("text-sm", row.bulletin_at_risk ? "text-warn" : "text-good")}>
            {row.bulletin_at_risk
              ? <><span className="font-semibold">No rain or temperature reading this week.</span> Enter one by Sunday, or the farmers get no bulletin on {fmtDate(bulletin.sends_on)}.</>
              : <><span className="font-semibold">This week's readings are in.</span> The bulletin goes to the farmers on {fmtDate(bulletin.sends_on)}.</>}
          </p>
          {row.bulletin_at_risk && canWrite(session?.user) && (
            <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" aria-hidden />} onClick={() => navigate("/observations")}>Add a reading</Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card title={`Rural pilot: farmers reached by ${fmtDate(target.deadline)}`}
      description="A farmer is reached once the SMS company reports a message delivered to their phone. Rural pilot stations only."
      actions={<>
        <DaysLeft days={target.days_left} deadline={target.deadline} />
        <Button size="sm" icon={<Target className="h-3.5 w-3.5" aria-hidden />} onClick={() => navigate("/rural-adoption")}>Rural adoption</Button>
      </>}>
      <div className="space-y-3">
        <p className="text-ink-2">
          <span className="text-2xl font-semibold text-ink">{fmtInt(totals.farmers_reached)}</span>
          {target.farmers
            ? <> of <span className="font-semibold text-ink">{fmtInt(target.farmers)}</span> farmers reached</>
            : totals.farmers_reached === 1 ? " farmer reached" : " farmers reached"}
          <span className="text-sm"> · {fmtInt(totals.farmers_active)} receive SMS at {fmtInt(totals.rural_stations)} rural {totals.rural_stations === 1 ? "station" : "stations"}</span>
        </p>
        {target.farmers && target.farmers_pct !== null
          ? <TargetBar pct={target.farmers_pct} />
          : (
            <p className="text-sm text-ink-2">
              No target is set yet, so progress cannot be shown.{" "}
              <button type="button" className="font-semibold text-accent underline" onClick={() => navigate("/sms-setup")}>Set it under SMS setup</button>.
            </p>
          )}
        {totals.stations_bulletin_at_risk > 0 && (
          <p className="text-sm text-warn">
            <span className="font-semibold">{fmtInt(totals.stations_bulletin_at_risk)} {totals.stations_bulletin_at_risk === 1 ? "station has" : "stations have"} farmers and no reading this week:</span>{" "}
            no bulletin from {totals.stations_bulletin_at_risk === 1 ? "it" : "them"} on {fmtDate(bulletin.sends_on)} unless readings are entered by Sunday.
          </p>
        )}
      </div>
    </Card>
  );
}
