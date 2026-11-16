/**
 * Station home (screen SCR-031): the state of the station's own data and what needs attention.
 *   GET /api/analysis/overview/           headline figures, readings per day, latest upload
 *   GET /api/analysis/data-quality/       completeness and problem rows, last 30 days
 *   GET /api/sensors/hardware/?calibration_status=Overdue|Due
 *   GET /api/analysis/adoption/           the station's farmers in the rural pilot, if it has any
 * A station account is scoped by the server, so none of these requests names the station.
 */
import { useNavigate } from "react-router-dom";
import { Plus, Upload } from "lucide-react";
import { Button, PageHeader } from "../components/ui";
import { CalibrationAttentionCard } from "../modules/calibration";
import { OverviewPanel } from "../modules/overview";
import { PilotProgressCard } from "../modules/pilot";
import { useTerms } from "../hooks/useTerms";
import { canWrite, useSession } from "../services/session";

export default function Home() {
  const session = useSession();
  const navigate = useNavigate();
  const terms = useTerms();
  const station = session?.user.station;
  if (!session || !station) return null;
  return (
    <div className="space-y-4">
      <PageHeader title={station.name}
        description={`${station.station_type ? `${station.station_type} station` : "Station"} ${station.station_code}. The figures below cover this station only: its sensors, the ${terms.readings} received over the last 30 complete days, and what needs attention.`}
        actions={canWrite(session.user) ? (
          <>
            <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => navigate("/observations")}>Add a reading</Button>
            <Button variant="primary" icon={<Upload className="h-4 w-4" aria-hidden />} onClick={() => navigate("/upload")}>{terms.upload}</Button>
          </>
        ) : undefined} />
      <PilotProgressCard scope="station" />
      <OverviewPanel />
      <CalibrationAttentionCard />
    </div>
  );
}
