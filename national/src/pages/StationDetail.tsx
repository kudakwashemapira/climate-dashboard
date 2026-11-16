/**
 * One station (FR-003, FR-005; screen SCR-004): everything the national office holds about it.
 *   GET, PATCH /api/stations/stations/<id>/
 * Each tab is the same screen a station user has, fixed to this station: the list requests carry
 * ?station=<id> and new records are written to it. A tab that is not open makes no requests.
 */
import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Building2, ClipboardCheck, CloudLightning, CloudRain, Factory, Layers, LayoutDashboard, LineChart, MessageSquare, MessageSquareReply, Pencil, Radio,
  ShieldAlert, Sprout, Tractor, Wifi, Zap,
} from "lucide-react";
import { FormDialog, rowToForm } from "../components/FormDialog";
import { Tabs, type TabDef } from "../components/Tabs";
import { useToast } from "../components/Toast";
import { Badge, Button, EmptyState, ErrorState, PageHeader } from "../components/ui";
import { useStations } from "../hooks/useLookups";
import { useFetch, useSave } from "../hooks/useResource";
import { STATION_TONE } from "../lib/tones";
import { CalibrationAttentionCard, CalibrationsScreen } from "../modules/calibration";
import { CarbonScreen, EventsScreen, InfrastructureScreen, RenewablesScreen, RiskScreen } from "../modules/categories";
import { FarmClimateScreen } from "../modules/farmClimate";
import { FarmersScreen, IncomingSmsScreen, SmsMessagesScreen } from "../modules/farmers";
import { ObservationsScreen } from "../modules/observations";
import { OverviewPanel } from "../modules/overview";
import { SensorsScreen } from "../modules/sensors";
import { BaselinesScreen, OperatorsScreen, StationProfileCard } from "../modules/station";
import type { Station } from "../services/types";
import { STATION_FIELDS, checkStation } from "./Stations";
import { AccountsScreen } from "./Users";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-base font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

export default function StationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const stationId = Number(id);
  const valid = Number.isInteger(stationId) && stationId > 0;
  const query = useFetch<Station>(`/stations/stations/${stationId}/`, {}, valid);
  const { stations } = useStations();
  const save = useSave<Station>("/stations/stations/");
  const [editing, setEditing] = useState(false);
  const station = query.data;

  const back = <Button icon={<ArrowLeft className="h-4 w-4" aria-hidden />} onClick={() => navigate("/stations")}>All stations</Button>;

  if (!valid || query.error) {
    return (
      <div>
        <PageHeader title="Station" description="The station record could not be opened." actions={back} />
        <div className="card">
          {valid
            ? <ErrorState error={query.error} onRetry={() => query.refetch()} />
            : <EmptyState title="There is no station at this address" hint="Open a station from the station registry." />}
        </div>
      </div>
    );
  }

  const other: TabDef[] = [
    { id: "carbon", label: "Carbon emissions", icon: Factory, render: () => <CarbonScreen station={stationId} embedded /> },
    { id: "events", label: "Extreme weather events", icon: CloudLightning, render: () => <EventsScreen station={stationId} embedded /> },
    { id: "renewables", label: "Renewable energy", icon: Zap, render: () => <RenewablesScreen station={stationId} embedded /> },
    { id: "risk", label: "Community risk", icon: ShieldAlert, render: () => <RiskScreen station={stationId} embedded /> },
    { id: "infrastructure", label: "Infrastructure", icon: Wifi, render: () => <InfrastructureScreen station={stationId} embedded /> },
  ];
  const farmers: TabDef[] = [
    { id: "climate", label: "Farm climate", icon: Sprout, render: () => <FarmClimateScreen station={stationId} embedded /> },
    { id: "list", label: "Farmers", icon: Tractor, render: () => <FarmersScreen station={stationId} embedded /> },
    { id: "sms", label: "SMS to farmers", icon: MessageSquare, render: () => <SmsMessagesScreen station={stationId} embedded /> },
    { id: "texts", label: "Texts from farmers", icon: MessageSquareReply, render: () => <IncomingSmsScreen station={stationId} embedded /> },
  ];
  const tabs: TabDef[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, render: () => (
      <div className="space-y-4">
        <OverviewPanel params={{ station: stationId }} />
        <CalibrationAttentionCard station={stationId} />
      </div>
    ) },
    { id: "profile", label: "Profile and people", icon: Building2, render: () => (
      <div className="space-y-6">
        <StationProfileCard station={stationId} />
        <Section title="Station operators"><OperatorsScreen station={stationId} embedded /></Section>
        <Section title="Accounts of this station"><AccountsScreen station={stationId} embedded /></Section>
      </div>
    ) },
    { id: "observations", label: "Observations", icon: CloudRain, render: () => <ObservationsScreen station={stationId} embedded /> },
    { id: "sensors", label: "Sensors", icon: Radio, render: () => <SensorsScreen station={stationId} embedded /> },
    { id: "calibration", label: "Calibration", icon: ClipboardCheck, render: () => <CalibrationsScreen station={stationId} embedded /> },
    { id: "baselines", label: "Baselines", icon: LineChart, render: () => <BaselinesScreen station={stationId} embedded /> },
    { id: "other", label: "Other data", icon: Layers, render: () => <Tabs tabs={other} label="Other data of this station" param="data" /> },
    { id: "farmers", label: "Farmers", icon: Tractor, render: () => <Tabs tabs={farmers} label="Farmers of this station" param="farm" /> },
  ];

  const place = station ? [station.district, station.province].filter(Boolean).join(", ") : "";
  return (
    // The key resets page numbers and filters when another station is opened.
    <div key={stationId}>
      <PageHeader
        title={station ? `${station.station_code} ${station.name}` : "Station"}
        description={station
          ? `${station.station_type} station in ${place}. Station ID ${station.id}: its users type this number when they sign in to the station app.`
          : "Loading the station record."}
        actions={(
          <>
            {station && <Badge tone={STATION_TONE[station.status]}>{station.status}</Badge>}
            {back}
            {station && <Button variant="primary" icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setEditing(true)}>Edit station</Button>}
          </>
        )} />
      <Tabs tabs={tabs} label="Station" />
      {station && (
        <FormDialog open={editing} mode="edit" title="Edit station" description="Fields marked * are required."
          fields={STATION_FIELDS} initial={rowToForm(STATION_FIELDS, station as unknown as Record<string, unknown>)}
          validate={(form) => checkStation(form, station, stations)}
          onSubmit={async (payload) => {
            await save.mutateAsync({ id: station.id, data: payload });
            toast.success("The station was updated.");
          }}
          onClose={() => setEditing(false)} />
      )}
    </div>
  );
}
