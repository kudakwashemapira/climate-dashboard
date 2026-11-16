/**
 * The national application (dcces.zchpc.ac.zw): national superadmins oversee every station.
 * Screens SCR-001 to SCR-023 of CD-3.05, in the four sidebar groups of CD-2.04 section 4.1, and the
 * rural pilot group (farmers, their SMS and the adoption report).
 * Screens that also exist in the station app come from modules/; the national-only ones are in pages/.
 */
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity, BarChart3, BellRing, ClipboardCheck, CloudDrizzle, CloudLightning, CloudRain, Factory, FileDown, LayoutDashboard, LifeBuoy,
  LineChart, ListChecks, Map as MapIcon, MessageSquare, MessageSquareReply, Radio, RadioTower, ScrollText, ShieldAlert, Sprout, Target, Thermometer, Tractor, Upload,
  Users as UsersIcon, Wifi, Zap,
} from "lucide-react";
import { AppShell, type NavGroup } from "./components/AppShell";
import { Button, EmptyState } from "./components/ui";
import { AuditScreen } from "./modules/audit";
import { CalibrationsScreen } from "./modules/calibration";
import { CarbonScreen, EventsScreen, InfrastructureScreen, RenewablesScreen, RiskScreen } from "./modules/categories";
import { FarmClimateScreen } from "./modules/farmClimate";
import { FarmersScreen, IncomingSmsScreen, SmsMessagesScreen } from "./modules/farmers";
import { ObservationsScreen } from "./modules/observations";
import { ReportsScreen } from "./modules/reports";
import { SensorsScreen } from "./modules/sensors";
import { SettingsScreen } from "./modules/settings";
import { BaselinesScreen } from "./modules/station";
import { UploadScreen } from "./modules/upload";
import CarbonOutput from "./pages/CarbonOutput";
import Dashboard from "./pages/Dashboard";
import DataQuality from "./pages/DataQuality";
import ExtremeAlerts from "./pages/ExtremeAlerts";
import Login from "./pages/Login";
import RainfallAnomalies from "./pages/RainfallAnomalies";
import RegionalComparison from "./pages/RegionalComparison";
import RuralAdoption from "./pages/RuralAdoption";
import SmsSetup from "./pages/SmsSetup";
import StationDetail from "./pages/StationDetail";
import Stations from "./pages/Stations";
import TemperatureTrends from "./pages/TemperatureTrends";
import Users from "./pages/Users";
import { clearSession, useSession } from "./services/session";

const NAV: NavGroup[] = [
  { label: "Main", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, keywords: "home national overview kpi summary" },
    { to: "/stations", label: "Stations", icon: RadioTower, keywords: "registry register province status profile operators station id" },
    { to: "/observations", label: "Weather observations", icon: CloudRain, keywords: "readings temperature rainfall humidity wind export" },
    { to: "/upload", label: "Upload observations", icon: Upload, keywords: "bulk file excel csv template history delete batch" },
  ] },
  { label: "Climate categories", items: [
    { to: "/sensors", label: "Sensors and hardware", icon: Radio, keywords: "instruments equipment" },
    { to: "/calibrations", label: "Calibration records", icon: ClipboardCheck, keywords: "calibrate revert overdue history" },
    { to: "/baselines", label: "Baselines", icon: LineChart, keywords: "climatology normal reference period" },
    { to: "/carbon", label: "Carbon emissions", icon: Factory, keywords: "co2 emission logs" },
    { to: "/events", label: "Extreme weather events", icon: CloudLightning, keywords: "flood drought heatwave storm" },
    { to: "/renewables", label: "Renewable energy", icon: Zap, keywords: "solar wind hydro generation" },
    { to: "/risk", label: "Community risk", icon: ShieldAlert, keywords: "hazard rating disaster" },
    { to: "/infrastructure", label: "Infrastructure", icon: Wifi, keywords: "power connectivity uptime" },
  ] },
  { label: "Analytics", items: [
    { to: "/rainfall-anomalies", label: "Rainfall anomalies", icon: CloudDrizzle, keywords: "precipitation wetter drier baseline" },
    { to: "/temperature-trends", label: "Temperature trends", icon: Thermometer, keywords: "annual mean warming decade" },
    { to: "/carbon-output", label: "Carbon output", icon: BarChart3, keywords: "co2 totals province category quarter" },
    { to: "/extreme-alerts", label: "Extreme weather alerts", icon: BellRing, keywords: "events severity type active" },
    { to: "/regional", label: "Regional comparison", icon: MapIcon, keywords: "provinces side by side" },
    { to: "/reports", label: "Reports and exports", icon: FileDown, keywords: "report builder download excel csv generated" },
  ] },
  { label: "Rural pilot", items: [
    { to: "/rural-adoption", label: "Rural adoption", icon: Target, keywords: "farmers rural pilot target november usage in use sign-ins" },
    { to: "/farmers", label: "Farmers", icon: Tractor, keywords: "register phone sms consent village rural" },
    { to: "/sms", label: "SMS to farmers", icon: MessageSquare, keywords: "messages bulletin alert welcome sent delivered failed" },
    { to: "/sms-texts", label: "Texts from farmers", icon: MessageSquareReply, keywords: "replies stop start rain help questions incoming" },
    { to: "/farm-climate", label: "Farm climate", icon: Sprout, keywords: "farmers rain season normal bulletin shona ndebele" },
    { to: "/sms-setup", label: "SMS setup", icon: ListChecks, keywords: "sms company provider api sender number webhook delivery reports checklist needed" },
  ] },
  { label: "System governance", items: [
    { to: "/data-quality", label: "Data quality", icon: Activity, keywords: "completeness gaps rejected suspect overdue" },
    { to: "/users", label: "Users and access", icon: UsersIcon, keywords: "accounts roles password station admin" },
    { to: "/audit", label: "Audit trail", icon: ScrollText, keywords: "activity log history who" },
    { to: "/settings", label: "Settings and help", icon: LifeBuoy, keywords: "account theme password" },
  ] },
];

export default function App() {
  const session = useSession();
  const client = useQueryClient();
  // Nothing read by one account may be shown to the next one on this computer.
  useEffect(() => { if (!session) client.clear(); }, [session, client]);

  if (!session) return <Login />;
  if (!session.user.is_superuser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page p-6">
        <div className="card max-w-lg">
          <EmptyState title="This is not a national account" hint="The national app is for national superadmins. Station accounts use the station app."
            action={<Button variant="primary" onClick={clearSession}>Sign out</Button>} />
        </div>
      </div>
    );
  }
  return (
    <AppShell appLabel="National" nav={NAV}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/stations" element={<Stations />} />
        <Route path="/stations/:id" element={<StationDetail />} />
        <Route path="/observations" element={<ObservationsScreen />} />
        <Route path="/upload" element={<UploadScreen />} />
        <Route path="/sensors" element={<SensorsScreen />} />
        <Route path="/calibrations" element={<CalibrationsScreen />} />
        <Route path="/baselines" element={<BaselinesScreen />} />
        <Route path="/carbon" element={<CarbonScreen />} />
        <Route path="/events" element={<EventsScreen />} />
        <Route path="/renewables" element={<RenewablesScreen />} />
        <Route path="/risk" element={<RiskScreen />} />
        <Route path="/infrastructure" element={<InfrastructureScreen />} />
        <Route path="/rainfall-anomalies" element={<RainfallAnomalies />} />
        <Route path="/temperature-trends" element={<TemperatureTrends />} />
        <Route path="/carbon-output" element={<CarbonOutput />} />
        <Route path="/extreme-alerts" element={<ExtremeAlerts />} />
        <Route path="/regional" element={<RegionalComparison />} />
        <Route path="/reports" element={<ReportsScreen />} />
        <Route path="/rural-adoption" element={<RuralAdoption />} />
        <Route path="/farmers" element={<FarmersScreen />} />
        <Route path="/sms" element={<SmsMessagesScreen />} />
        <Route path="/sms-texts" element={<IncomingSmsScreen />} />
        <Route path="/farm-climate" element={<FarmClimateScreen />} />
        <Route path="/sms-setup" element={<SmsSetup />} />
        <Route path="/data-quality" element={<DataQuality />} />
        <Route path="/users" element={<Users />} />
        <Route path="/audit" element={<AuditScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
