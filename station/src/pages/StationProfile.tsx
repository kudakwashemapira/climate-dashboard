/**
 * The station's own record and its operators:
 *   GET /api/stations/stations/<own id>/   read-only for station accounts
 *   /api/stations/operators/               list, add, edit, delete
 */
import { PageHeader } from "../components/ui";
import { OperatorsScreen, StationProfileCard } from "../modules/station";
import { useSession } from "../services/session";

export default function StationProfile() {
  const station = useSession()?.user.station;
  if (!station) return null;
  return (
    <div className="space-y-5">
      <PageHeader title="Station profile"
        description="How your station is registered, and the people who run it. The registration itself is changed by a national administrator." />
      <StationProfileCard station={station.id} />
      <div>
        <h2 className="mb-2 text-base font-semibold text-ink">Station operators</h2>
        <OperatorsScreen embedded />
      </div>
    </div>
  );
}
