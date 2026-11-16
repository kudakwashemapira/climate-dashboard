/**
 * Farm climate (rural pilot): GET /api/analysis/farm-climate/[?station=<id>]
 * What farmers near one station need to know, from the station's own readings: the rain of the last
 * complete week (Monday to Sunday, the same whichever day the page is opened) and of the season against
 * the normal, the temperature range, the rain of each of the last 30 days, the weather alerts in force
 * and the hazards of the area. Below it, the SMS that farmers get this week in each language, the
 * button that sends it now, a warning when this week has no reading yet (so next Monday's bulletin
 * would not go out) and the number farmers text STOP, START, RAIN or HELP to.
 *
 * The figures part can be shown in English, Shona or Ndebele, for a meeting with farmers or an
 * extension officer's phone. The Shona and Ndebele words are drafts until a native speaker has
 * checked them (the API says which languages are reviewed); the staff part stays in English.
 * Every figure and every translated event name comes from the server; nothing is computed here.
 */
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BellRing, CalendarDays, CloudRain, MessageSquare, ShieldAlert, Thermometer } from "lucide-react";
import { CHART_MARGIN, ChartCard, TooltipBox, axisStyle, axisUnit, useChartColors, type TipProps } from "../components/charts";
import { PlainTable } from "../components/DataTable";
import {
  Badge, Card, EmptyState, ErrorState, FilterBar, KpiCard, KpiGrid, Notice, PageHeader, Segmented, SelectFilter, Spinner, cx, type Tone,
} from "../components/ui";
import { useFetch } from "../hooks/useResource";
import { fmtDate, fmtDateTime, fmtDay, fmtInt, fmtNumber } from "../lib/format";
import { SEVERITY_TONE } from "../lib/tones";
import type { FarmClimate, VersusNormal } from "../services/analysis";
import type { Language } from "../services/types";
import { useStationScope, type ModuleProps } from "./common";
import { SendBulletinButton } from "./farmers";

type Words = {
  title: string; description: string; rainWeek: string; rainDays: string; rainDaysDetail: string; season: (from: string) => string;
  temperature: string; temperatureDetail: string; versus: Record<VersusNormal, string>; normal: (mm: string) => string; noNormal: string;
  noReadings: string; dailyTitle: string; dailyDescription: string; day: string; rainOfDay: string; noReading: string;
  alerts: string; noAlerts: string; since: string; risks: string; noRisks: string; rating: (n: number) => string;
};

/** The page in the three languages. Shona and Ndebele: DRAFTS, to be checked by native speakers. */
const WORDS: Record<Language, Words> = {
  en: {
    title: "Farm climate",
    description: "The rain and temperature measured at this station, the weather alerts in force and the hazards of the area: what farmers near the station need to know.",
    rainWeek: "Rain, last week", rainDays: "Rain days", rainDaysDetail: "Days with 1 mm or more", season: (from) => `Season rain since ${from}`,
    temperature: "Temperature", temperatureDetail: "Lowest and highest reading, last week",
    versus: { above: "Above normal", near: "Near normal", below: "Below normal" }, normal: (mm) => `normal ${mm} mm`, noNormal: "no normal on record",
    noReadings: "No readings", dailyTitle: "Rain each day, last 30 days",
    dailyDescription: "Millimetres per day. A day without a reading is left empty: it is not counted as a dry day.",
    day: "Day", rainOfDay: "Rain (mm)", noReading: "no reading",
    alerts: "Weather alerts in force", noAlerts: "No weather alert is in force.", since: "since",
    risks: "Hazards of the area", noRisks: "No risk rating has been recorded yet.", rating: (n) => `${n} of 5`,
  },
  sn: {
    title: "Mamiriro ekunze ekurima",
    description: "Mvura nekupisa zvakayerwa pachiteshi chino, yambiro dziripo uye njodzi dzenzvimbo: zvinodiwa nevarimi vari pedyo nechiteshi.",
    rainWeek: "Mvura, vhiki rakapfuura", rainDays: "Mazuva akanaya", rainDaysDetail: "Mazuva ane 1 mm kana kupfuura", season: (from) => `Mvura yemwaka kubva ${from}`,
    temperature: "Kupisa", temperatureDetail: "Zviyero zvakaderera nezvakakwira, vhiki rakapfuura",
    versus: { above: "Kupfuura zvakajairwa", near: "Zvakaenzana nezvakajairwa", below: "Pasi pezvakajairwa" }, normal: (mm) => `zvakajairwa ${mm} mm`,
    noNormal: "hapana zvakajairwa zvakanyorwa",
    noReadings: "Hapana zviyero", dailyTitle: "Mvura zuva nezuva, mazuva 30",
    dailyDescription: "Mamilimita pazuva. Zuva risina chiyero rasiiwa risina chinhu: harisi zuva rakaoma.",
    day: "Zuva", rainOfDay: "Mvura (mm)", noReading: "hapana chiyero",
    alerts: "Yambiro dziripo", noAlerts: "Hapana yambiro iripo.", since: "kubva",
    risks: "Njodzi dzenzvimbo", noRisks: "Hapana njodzi dzakanyorwa.", rating: (n) => `${n} pa5`,
  },
  nd: {
    title: "Isimo sezulu sokulima",
    description: "Imvula lokutshisa okulinganiswe kulesi siteshi, izexwayiso ezikhona lezingozi zendawo: lokho abalimi abaseduze lesiteshi abakudingayo.",
    rainWeek: "Imvula, iviki eledlulileyo", rainDays: "Insuku okunethe ngazo", rainDaysDetail: "Insuku ezilo 1 mm kumbe ngaphezulu",
    season: (from) => `Imvula yesikhathi kusukela ${from}`,
    temperature: "Ukutshisa", temperatureDetail: "Isilinganiso esiphansi lesiphezulu, iviki eledlulileyo",
    versus: { above: "Ngaphezu kokujwayelekileyo", near: "Kuyafana lokujwayelekileyo", below: "Ngaphansi kokujwayelekileyo" },
    normal: (mm) => `okujwayelekileyo ${mm} mm`, noNormal: "akulakujwayelekileyo okubhaliweyo",
    noReadings: "Akulazilinganiso", dailyTitle: "Imvula usuku ngosuku, insuku ezingu-30",
    dailyDescription: "Amamilimitha ngosuku. Usuku olungelasilinganiso lutshiywe lungelalutho: kalusilo usuku olomileyo.",
    day: "Usuku", rainOfDay: "Imvula (mm)", noReading: "akulasilinganiso",
    alerts: "Izexwayiso ezikhona", noAlerts: "Akulasexwayiso esikhona.", since: "kusukela",
    risks: "Izingozi zendawo", noRisks: "Akulazingozi ezibhaliweyo.", rating: (n) => `${n} kwezi-5`,
  },
};

const VERSUS_TONE: Record<VersusNormal, Tone> = { above: "info", near: "good", below: "warn" };
const LANGUAGE_KEY = "climate.farm.language";

/** The page language is remembered on this computer only, as a convenience. */
function useLanguage(): [Language, (language: Language) => void] {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY);
      return saved === "sn" || saved === "nd" ? saved : "en";
    } catch {
      return "en";
    }
  });
  const choose = (next: Language) => {
    setLanguage(next);
    try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* storage unavailable: the choice lasts for this page */ }
  };
  return [language, choose];
}

const mm = (value: number | null) => (value === null ? "" : fmtNumber(value, value >= 10 ? 0 : 1));

function RainCard({ label, total, readings, normal, versus, icon, words, detail }: {
  label: string; total: number | null; readings: number; normal: number | null; versus: VersusNormal | null; icon: typeof CloudRain;
  words: Words; detail?: string;
}) {
  if (!readings) return <KpiCard label={label} value={words.noReadings} detail={detail} icon={icon} tone="neutral" />;
  return (
    <KpiCard label={label} value={`${mm(total)} mm`} icon={icon} tone={versus ? VERSUS_TONE[versus] : "info"}
      detail={versus && normal !== null ? `${words.versus[versus]}: ${words.normal(mm(normal))}` : words.noNormal} />
  );
}

function DailyRain({ data, query, words }: { data: FarmClimate["daily_rain"]; query: { isLoading: boolean; isFetching: boolean; error: unknown; refetch: () => unknown }; words: Words }) {
  const c = useChartColors();
  const tip = ({ active, payload }: TipProps) => {
    const point = payload?.[0]?.payload as FarmClimate["daily_rain"][number] | undefined;
    if (!active || !point) return null;
    return <TooltipBox title={fmtDate(point.date)} rows={[{ key: "rain", label: "mm", value: point.rain_mm === null ? words.noReading : fmtNumber(point.rain_mm, 1), color: c.wet }]} />;
  };
  return (
    <ChartCard title={words.dailyTitle} description={words.dailyDescription} query={query} empty={data.every((d) => d.rain_mm === null)}
      emptyTitle={words.noReadings}
      chart={(
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={24} {...axisStyle(c)} />
            <YAxis width={52} label={axisUnit(c, "mm")} {...axisStyle(c)} axisLine={false} />
            <Tooltip content={tip} cursor={{ fill: c.grid, fillOpacity: 0.5 }} isAnimationActive={false} />
            <Bar dataKey="rain_mm" name="Rain" fill={c.wet} maxBarSize={16} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
      table={(
        <PlainTable caption={words.dailyTitle} rows={[...data].reverse()} rowKey={(row) => row.date}
          columns={[
            { key: "date", header: words.day, cell: (row) => fmtDate(row.date) },
            { key: "rain", header: words.rainOfDay, align: "right", cell: (row) => (row.rain_mm === null ? <span className="text-muted">{words.noReading}</span> : fmtNumber(row.rain_mm, 1)) },
          ]} />
      )} />
  );
}

/** This week's SMS in each language, the farmers who get it and the button that sends it now. Staff only, in English. */
function BulletinCard({ data, station }: { data: FarmClimate; station: number }) {
  return (
    <Card title="This week's SMS bulletin"
      description={`What the farmers of this station get on Monday morning, for ${fmtDate(data.period.from)} to ${fmtDate(data.period.to)}. ${data.last_bulletin_at ? `Last sent ${fmtDateTime(data.last_bulletin_at)}.` : "No bulletin has been sent yet."}`}
      actions={<SendBulletinButton station={station} />}>
      {data.next_bulletin.at_risk && (
        <div className="mb-3">
          <Notice tone="warn" title="No reading this week yet">
            No rain or temperature reading has been entered for this week, {fmtDate(data.next_bulletin.from)} to {fmtDate(data.next_bulletin.to)}.
            Without one by Sunday, the {fmtInt(data.farmers.active)} farmers get no bulletin on {fmtDate(data.next_bulletin.sends_on)}. Enter the readings under Readings.
          </Notice>
        </div>
      )}
      <p className="text-sm text-ink-2">
        <span className="font-semibold text-ink">{fmtInt(data.farmers.active)}</span> farmers receive SMS
        ({data.farmers.by_language.map((l) => `${fmtInt(l.count)} ${l.name}`).join(", ")}){data.farmers.opted_out ? `; ${fmtInt(data.farmers.opted_out)} have stopped` : ""}.
        {" "}<span className="font-semibold text-ink">{fmtInt(data.farmers.reached)}</span> of them reached: an SMS was reported delivered to their phone.
        {!data.next_bulletin.at_risk && data.farmers.active > 0 && ` This week so far: ${fmtInt(data.next_bulletin.readings)} readings for the bulletin of ${fmtDate(data.next_bulletin.sends_on)}.`}
      </p>
      <p className="mt-1.5 text-sm text-ink-2">
        {data.reply_number
          ? <>Farmers text <span className="font-semibold text-ink">RAIN</span> to <span className="font-semibold text-ink">{data.reply_number}</span> for these figures, STOP to end and START to begin again. Their texts are under Texts from farmers.</>
          : "No number for farmers' texts is set on the server yet (SMS_REPLY_NUMBER): to stop the SMS, a farmer tells the station staff."}
      </p>
      <ul className="mt-4 space-y-3">
        {data.bulletin.map((b) => (
          <li key={b.language} className="rounded-md border border-line p-3">
            <p className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink">
              {b.name}
              {!b.reviewed && <Badge tone="warn">Draft translation</Badge>}
              <span className="font-normal text-muted">{b.text.length} characters{b.text.length > 160 ? `, ${Math.ceil(b.text.length / 153)} SMS parts` : ", one SMS"}</span>
            </p>
            <p className="text-sm text-ink">{b.text}</p>
            {b.sent_as !== b.language && (
              <p className="mt-1.5 text-xs text-muted">Not sent yet: farmers who chose {b.name} get the English text until this translation is reviewed.</p>
            )}
          </li>
        ))}
      </ul>
      {data.bulletin.some((b) => !b.reviewed) && (
        <div className="mt-3">
          <Notice tone="warn">A draft translation was written without a native speaker. Once a Shona or an Ndebele speaker has checked it, the server administrator adds the language to SMS_REVIEWED_LANGUAGES and farmers receive it.</Notice>
        </div>
      )}
    </Card>
  );
}

export function FarmClimateScreen({ station, embedded }: ModuleProps) {
  const s = useStationScope(station);
  const [chosen, setChosen] = useState("");
  const [language, setLanguage] = useLanguage();
  const words = WORDS[language];
  const target = s.pick ? (chosen ? Number(chosen) : null) : s.stationId;
  const query = useFetch<FarmClimate>("/analysis/farm-climate/", target ? { station: target } : {}, target !== null);
  const data = target !== null ? query.data : undefined;
  const refreshing = query.isFetching && !query.isLoading;

  const languageSwitch = (
    <Segmented label="Page language" value={language} onChange={setLanguage}
      options={[{ value: "en", label: "English" }, { value: "sn", label: "Shona" }, { value: "nd", label: "Ndebele" }]} />
  );
  const reviewed = data?.bulletin.find((b) => b.language === language)?.reviewed ?? language === "en";

  return (
    <div className="space-y-4">
      {embedded
        ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-3xl text-ink-2">{words.description}</p>{languageSwitch}</div>
        : <PageHeader title={words.title} description={words.description} actions={languageSwitch} />}
      {s.pick && (
        <FilterBar>
          <SelectFilter id="farm-station" label="Station" value={chosen} onChange={setChosen} options={s.stationOptions} allLabel="Choose a station" className="min-w-[16rem]" />
        </FilterBar>
      )}
      {!reviewed && <Notice tone="warn">This page in {language === "sn" ? "Shona" : "Ndebele"} is a draft translation: check it with a native speaker before showing it to farmers.</Notice>}

      {target === null ? <div className="card"><EmptyState title="Choose a station" hint="The farm climate is shown for one station at a time." /></div>
        : query.error ? <div className="card"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>
        : !data ? <div className="card"><Spinner /></div>
        : (
          <div className={cx("space-y-4 transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing}>
            <p className="text-sm text-muted">{data.station_code} {data.station_name} · {fmtDate(data.period.from)} – {fmtDate(data.period.to)}</p>
            {data.weather_model && (
              <Notice tone="info" title="Development data">
                This week's figures are a weather model's values for the station's area, not the station's own measurements. {data.weather_model}.
              </Notice>
            )}
            <KpiGrid count={4}>
              <RainCard label={words.rainWeek} total={data.rain.total_mm} readings={data.rain.readings} normal={data.rain.normal_mm}
                versus={data.rain.vs_normal} icon={CloudRain} words={words} />
              <KpiCard label={words.rainDays} value={data.rain.readings ? fmtInt(data.rain.rain_days) : words.noReadings} detail={words.rainDaysDetail}
                icon={CalendarDays} tone="info" />
              <RainCard label={words.season(fmtDate(data.season.from))} total={data.season.total_mm} readings={data.season.readings}
                normal={data.season.normal_mm} versus={data.season.vs_normal} icon={CloudRain} words={words} />
              <KpiCard label={words.temperature} icon={Thermometer} tone="info" detail={words.temperatureDetail}
                value={data.temperature.readings ? `${fmtNumber(data.temperature.min_c, 0)} – ${fmtNumber(data.temperature.max_c, 0)} °C` : words.noReadings} />
            </KpiGrid>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2"><DailyRain data={data.daily_rain} query={query} words={words} /></div>
              <Card title={words.alerts}>
                {data.alerts.length === 0 ? <EmptyState title={words.noAlerts} icon={BellRing} /> : (
                  <ul className="space-y-3">
                    {data.alerts.map((a) => (
                      <li key={a.id}>
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                          {a.names[language].event}<Badge tone={SEVERITY_TONE[a.severity]}>{a.names[language].severity}</Badge>
                        </p>
                        <p className="mt-0.5 text-xs text-muted">{words.since} {fmtDateTime(a.started_at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card title={words.risks}>
                {data.risks.length === 0 ? <EmptyState title={words.noRisks} icon={ShieldAlert} /> : (
                  <ul className="space-y-2.5">
                    {data.risks.map((r) => (
                      <li key={r.hazard_type} className="flex items-center justify-between gap-3">
                        <span className="text-ink">{r.names[language]}<span className="block text-xs text-muted">{fmtDate(r.assessed_on)}</span></span>
                        <Badge tone={r.rating >= 4 ? "crit" : r.rating === 3 ? "warn" : "neutral"}>{words.rating(r.rating)}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <div className="xl:col-span-2"><BulletinCard data={data} station={data.station} /></div>
            </div>
            {!embedded && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                Farmers and their messages are under Farmers, SMS to farmers and Texts from farmers.
              </p>
            )}
          </div>
        )}
    </div>
  );
}
