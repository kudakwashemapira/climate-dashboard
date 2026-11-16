/**
 * The station application (dcces-inst.zchpc.ac.zw): one station's administrators load and maintain
 * their own data. Screens SCR-030 to SCR-039 of CD-3.05. Each route names the API it works on.
 */
import { useEffect, useMemo } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2, ClipboardCheck, CloudLightning, CloudRain, Factory, FileDown, Home as HomeIcon, LifeBuoy, LineChart, MessageSquare, MessageSquareReply, Radio,
  ScrollText, ShieldAlert, Sprout, Upload, Users, Wifi, Zap,
} from "lucide-react";
import { AppShell, type NavGroup } from "./components/AppShell";
import { Button, EmptyState } from "./components/ui";
import { useTerms, type Terms } from "./hooks/useTerms";
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
import Home from "./pages/Home";
import Login from "./pages/Login";
import StationProfile from "./pages/StationProfile";
import { clearSession, useSession } from "./services/session";

/** The menu. The data entries are named for the type of the station (FR-003, hooks/useTerms.ts). */
const navFor = (terms: Terms): NavGroup[] => [
  { label: "Station", items: [
    { to: "/", label: "Home", icon: HomeIcon, end: true, keywords: "dashboard summary overview" },
    { to: "/station", label: "Station profile", icon: Building2, keywords: "operators contacts coordinates" },
  ] },
  { label: "Station data", items: [
    { to: "/observations", label: terms.observations, icon: CloudRain, keywords: "observations readings temperature rainfall humidity wind export" },
    { to: "/upload", label: terms.upload, icon: Upload, keywords: "upload bulk file excel csv template history delete batch" },
    { to: "/baselines", label: "Baselines", icon: LineChart, keywords: "climatology normal anomaly" },
  ] },
  { label: "Farmers", items: [
    { to: "/farm-climate", label: "Farm climate", icon: Sprout, keywords: "farmers rain season normal bulletin shona ndebele rural" },
    { to: "/farmers", label: "Farmers", icon: Users, keywords: "register phone sms consent village rural" },
    { to: "/sms", label: "SMS to farmers", icon: MessageSquare, keywords: "messages bulletin alert welcome sent delivered failed" },
    { to: "/sms-texts", label: "Texts from farmers", icon: MessageSquareReply, keywords: "replies stop start rain help questions incoming" },
  ] },
  { label: "Equipment", items: [
    { to: "/sensors", label: "Sensors", icon: Radio, keywords: "hardware instruments" },
    { to: "/calibrations", label: "Calibration", icon: ClipboardCheck, keywords: "calibrate revert overdue history" },
  ] },
  { label: "Other data", items: [
    { to: "/carbon", label: "Carbon emissions", icon: Factory, keywords: "co2 emission" },
    { to: "/events", label: "Extreme weather events", icon: CloudLightning, keywords: "alerts flood drought heatwave storm" },
    { to: "/renewables", label: "Renewable energy", icon: Zap, keywords: "solar wind hydro generation" },
    { to: "/risk", label: "Community risk", icon: ShieldAlert, keywords: "hazard rating disaster" },
    { to: "/infrastructure", label: "Infrastructure", icon: Wifi, keywords: "power connectivity uptime" },
  ] },
  { label: "Reports", items: [
    { to: "/reports", label: "Reports and exports", icon: FileDown, keywords: "download excel csv pdf report builder generated" },
    { to: "/audit", label: "Activity log", icon: ScrollText, keywords: "audit trail history" },
    { to: "/settings", label: "Settings and help", icon: LifeBuoy, keywords: "account theme password" },
  ] },
];

export default function App() {
  const session = useSession();
  const client = useQueryClient();
  const terms = useTerms();
  const nav = useMemo(() => navFor(terms), [terms]);
  // Nothing read by one account may be shown to the next one on this computer.
  useEffect(() => { if (!session) client.clear(); }, [session, client]);

  if (!session) return <Login />;
  if (!session.user.station) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page p-6">
        <div className="card max-w-lg">
          <EmptyState title="This account has no station" hint="The station app is for station accounts. National accounts use the national app."
            action={<Button variant="primary" onClick={clearSession}>Sign out</Button>} />
        </div>
      </div>
    );
  }
  return (
    <AppShell appLabel="Station" nav={nav}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/station" element={<StationProfile />} />
        <Route path="/observations" element={<ObservationsScreen />} />
        <Route path="/upload" element={<UploadScreen />} />
        <Route path="/baselines" element={<BaselinesScreen />} />
        <Route path="/farm-climate" element={<FarmClimateScreen />} />
        <Route path="/farmers" element={<FarmersScreen />} />
        <Route path="/sms" element={<SmsMessagesScreen />} />
        <Route path="/sms-texts" element={<IncomingSmsScreen />} />
        <Route path="/sensors" element={<SensorsScreen />} />
        <Route path="/calibrations" element={<CalibrationsScreen />} />
        <Route path="/carbon" element={<CarbonScreen />} />
        <Route path="/events" element={<EventsScreen />} />
        <Route path="/renewables" element={<RenewablesScreen />} />
        <Route path="/risk" element={<RiskScreen />} />
        <Route path="/infrastructure" element={<InfrastructureScreen />} />
        <Route path="/reports" element={<ReportsScreen />} />
        <Route path="/audit" element={<AuditScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
