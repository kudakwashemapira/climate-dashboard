/**
 * Users and access (FR-006, FR-021, UC-006; screen SCR-021):
 *   /api/users/accounts/   list, create, update (superadmins only)
 *                          ?station=&role=&is_active=true|false&search=   search matches email or name
 *   GET /api/users/roles/  the four access levels (D-008)
 *
 * How this screen follows the API exactly:
 *  - A new account is always a station account: the API requires its station, and only it can make
 *    an account national (is_superuser is read-only). National accounts are created by ZCHPC operations.
 *  - A password has at least 10 characters. It is required for a new account and left out of an
 *    update unless a new one is typed.
 *  - An account is deactivated, not deleted, so the audit trail and the upload history keep its name.
 */
import { PlainTable } from "../components/DataTable";
import type { FieldDef, FieldErrors } from "../components/FormDialog";
import { ResourcePage, type FilterDef, type ResourceConfig } from "../components/ResourcePage";
import { Badge, Card, ErrorState, Spinner } from "../components/ui";
import { useStations } from "../hooks/useLookups";
import { useAll } from "../hooks/useResource";
import type { ModuleProps } from "../modules/common";
import { useSession } from "../services/session";
import type { Role, User } from "../services/types";

const MIN_PASSWORD = 10; // UserSerializer: min_length=10
const none = <span className="text-muted">not recorded</span>;

function useRoles() {
  const query = useAll<Role>("/users/roles/");
  const roles = query.data ?? [];
  return { query, roles, byId: new Map(roles.map((role) => [role.id, role])) };
}

/** The accounts of every station, or of one station when `station` is given (station detail). */
export function AccountsScreen({ station, embedded }: ModuleProps) {
  const session = useSession();
  const { options: stationOptions, code } = useStations();
  const { roles, byId } = useRoles();
  const fixed = station !== undefined;
  // Level 1 is the national superadmin, which the accounts API cannot grant.
  const roleOptions = roles.filter((role) => role.level > 1).map((role) => ({ value: String(role.id), label: `${role.name} (level ${role.level})` }));

  const stationField: FieldDef[] = fixed ? [] : [{
    name: "station", label: "Station", type: "select", options: stationOptions, required: (mode) => mode === "create", wide: true,
    hint: "The one station this account signs in to. National accounts have none.",
  }];
  const filters: FilterDef[] = fixed ? [] : [
    { name: "search", label: "Email or name", type: "text", placeholder: "Search" },
    { name: "station", label: "Station", type: "select", options: stationOptions },
    { name: "role", label: "Role", type: "select", options: roles.map((role) => ({ value: String(role.id), label: role.name })) },
    { name: "is_active", label: "Status", type: "select", options: [{ value: "true", label: "Active" }, { value: "false", label: "Deactivated" }] },
  ];

  const config: ResourceConfig<User> = {
    path: "/users/accounts/",
    title: "Users and access",
    description: fixed
      ? "The accounts that sign in to the station app for this station. Each signs in with its email, its password, the station code and a one-time code sent to the email."
      : "Every account, national and station. A new account is a station account: choose its station and its role. Deactivate an account to stop it signing in; accounts are not deleted.",
    noun: "account",
    baseParams: fixed ? { station } : undefined,
    canDelete: false,
    describe: (row) => row.email,
    columns: [
      { key: "email", header: "Email (sign-in name)", cell: (row) => <span className="break-all font-semibold">{row.email}</span> },
      { key: "name", header: "Name", cell: (row) => `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || none },
      { key: "access", header: "Access", cell: (row) => {
        if (row.is_superuser) return <Badge tone="info">National superadmin</Badge>;
        const role = row.role === null ? undefined : byId.get(row.role);
        return role ? `${role.name} (level ${role.level})` : <span className="text-muted">No role: read-only</span>;
      } },
      ...(fixed ? [] : [{ key: "station", header: "Station", cell: (row: User) => (row.is_superuser ? "All stations" : code(row.station)) }]),
      { key: "status", header: "Status", cell: (row) => (row.is_active ? <Badge tone="good">Active</Badge> : <Badge tone="neutral">Deactivated</Badge>) },
    ],
    filters,
    fields: [
      { name: "email", label: "Email (sign-in name)", type: "email", required: true, maxLength: 254, wide: true, hint: "The one-time sign-in code is sent to this address." },
      { name: "first_name", label: "First name", maxLength: 80 },
      { name: "last_name", label: "Last name", maxLength: 80 },
      ...stationField,
      { name: "role", label: "Role", type: "select", options: roleOptions, wide: fixed, hint: "Levels 2 and 3 may add and change station data. Level 4, or no role, is read-only." },
      { name: "password", label: "Password", type: "password", required: true, only: "create", hint: `At least ${MIN_PASSWORD} characters. Give it to the user by a safe route.` },
      { name: "password", label: "New password", type: "password", only: "edit", hint: `Leave empty to keep the current password. At least ${MIN_PASSWORD} characters. A new password ends every sign-in of the account, and its owner is emailed.` },
      { name: "is_active", label: "This account may sign in", type: "checkbox", wide: true, hint: "Clear the box to deactivate the account. Its history is kept." },
    ],
    defaults: { is_active: true },
    toPayload: (payload) => (fixed ? { ...payload, station } : payload),
    validate: (form, mode, row) => {
      const errors: FieldErrors = {};
      const password = String(form.password ?? "");
      if (mode === "create" && !password) errors.password = "Set a first password for the account.";
      else if (password && password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
      if (!fixed) {
        if (row?.is_superuser && form.station) errors.station = "A national account is not linked to a station. Choose None.";
        else if (!row?.is_superuser && !form.station) errors.station = "A station account must belong to a station.";
      }
      if (row && row.id === session?.user.id && !form.is_active) errors.is_active = "This is the account you are signed in with. Another superadmin has to deactivate it.";
      return errors;
    },
    emptyHint: fixed ? "Add the first account so the station can sign in to the station app." : undefined,
  };
  return <ResourcePage config={config} embedded={embedded} />;
}

function RolesCard() {
  const { query, roles } = useRoles();
  return (
    <Card title="Roles and access levels" description="What each role allows. A station account only ever sees its own station, whatever its role." padded={false}>
      {query.error ? <ErrorState error={query.error} onRetry={() => query.refetch()} />
        : !query.data ? <Spinner />
        : (
          <div className="p-4">
            <PlainTable caption="Roles and access levels" rows={roles} rowKey={(role) => role.id} scroll={false}
              columns={[
                { key: "level", header: "Level", align: "right", cell: (role) => role.level },
                { key: "name", header: "Role", cell: (role) => <span className="font-semibold">{role.name}</span> },
                { key: "allows", header: "What it allows", cell: (role) => role.description ?? none },
                { key: "writes", header: "May change data", cell: (role) => (role.level <= 3 ? "Yes" : "No, read-only") },
              ]} />
            <p className="mt-3 text-xs text-muted">National superadmin accounts are created by ZCHPC operations, not on this screen.</p>
          </div>
        )}
    </Card>
  );
}

export default function Users() {
  return (
    <div className="space-y-5">
      <AccountsScreen />
      <RolesCard />
    </div>
  );
}
