/**
 * National dashboard (FR-005, FR-014; screen SCR-002): the state of every station at a glance.
 *   GET /api/analysis/overview/?province=&station_type=       headline figures, last 30 complete days
 *   GET /api/analysis/data-quality/?province=&station_type=   the stations to follow up
 * Both are drawn by OverviewPanel, the same panel a station sees for its own data, so a national
 * figure and a station figure are the same calculation over a different scope.
 *   GET /api/analysis/adoption/?rural=true                    the rural pilot against its target and deadline
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileDown, RadioTower } from "lucide-react";
import { Button, FilterBar, PageHeader, SelectFilter } from "../components/ui";
import { OverviewPanel } from "../modules/overview";
import { PilotProgressCard } from "../modules/pilot";
import { PROVINCE_OPTIONS, STATION_TYPE_OPTIONS } from "./shared";

export default function Dashboard() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ province: "", station_type: "" });
  const change = (name: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [name]: value }));
  const params = useMemo(() => ({ province: filters.province, station_type: filters.station_type }), [filters]);
  const filtered = Boolean(filters.province || filters.station_type);
  return (
    <div>
      <PageHeader title="National dashboard"
        description="Stations, sensors, readings and alerts across the country, with the data received over the last 30 complete days. Narrow every figure by province or station type."
        actions={(
          <>
            <Button icon={<RadioTower className="h-4 w-4" aria-hidden />} onClick={() => navigate("/stations")}>Stations</Button>
            <Button icon={<FileDown className="h-4 w-4" aria-hidden />} onClick={() => navigate("/reports")}>Reports and exports</Button>
          </>
        )} />
      {/* Above the filters: the pilot is followed as a whole, whatever province is chosen. */}
      <div className="mb-4"><PilotProgressCard scope="national" /></div>
      <FilterBar onReset={filtered ? () => setFilters({ province: "", station_type: "" }) : undefined}>
        <SelectFilter id="dashboard-province" label="Province" value={filters.province} onChange={(v) => change("province", v)} options={PROVINCE_OPTIONS} allLabel="All provinces" className="min-w-[14rem]" />
        <SelectFilter id="dashboard-type" label="Station type" value={filters.station_type} onChange={(v) => change("station_type", v)} options={STATION_TYPE_OPTIONS} allLabel="All types" className="min-w-[12rem]" />
      </FilterBar>
      <OverviewPanel params={params} />
    </div>
  );
}
