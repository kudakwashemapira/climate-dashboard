/**
 * The page pattern every list screen follows (CD-3.05 section 4): title, one-line description,
 * actions, optional KPI cards, filter bar, data table, pagination, and a create or edit dialog.
 * A screen is described by a ResourceConfig; this component supplies the behaviour once.
 */
import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAction, useList, useRemove, useSave } from "../hooks/useResource";
import { fmtInt } from "../lib/format";
import type { BulkDeleteResult } from "../services/analysis";
import { describeError, send, type Params } from "../services/http";
import { canAdminister, canWrite, useSession } from "../services/session";
import { ConfirmDialog } from "./Dialog";
import { DataTable, PAGE_SIZES, Pagination, type Column } from "./DataTable";
import { ExportButtons } from "./ExportButtons";
import { FormDialog, rowToForm, type FieldDef, type FieldErrors, type FormData, type FormMode, type Option } from "./FormDialog";
import { useToast } from "./Toast";
import { Button, Choice, FilterBar, IconButton, Notice, PageHeader } from "./ui";

export interface FilterDef {
  /** The query parameter the API reads. */
  name: string;
  label: string;
  type: "select" | "date" | "text";
  options?: Option[];
  placeholder?: string;
  /** Turns the chosen value into what the API expects, for example a day into a time bound. */
  toParam?: (value: string) => string;
}

export interface ResourceConfig<T> {
  /** List endpoint, for example "/sensors/hardware/". */
  path: string;
  title: string;
  description: string;
  /** Singular name used in buttons and messages: "sensor". */
  noun: string;
  columns: Column<T>[];
  /** Column keys whose header sorts the list: the keys of the record set's sorts in backend/reports/datasets.py. */
  sortable?: string[];
  fields: FieldDef[];
  filters?: FilterDef[];
  /** How one row is named in the delete confirmation. */
  describe: (row: T) => string;
  updateMethod?: "PATCH" | "PUT";
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  /** Query parameters always sent with the list request. */
  baseParams?: Params;
  /** Query parameters sent with a create or update, for example the station a superadmin chose. */
  saveParams?: (form: FormData) => Params;
  /** Last change to the request body, for example adding the station the record belongs to. */
  toPayload?: (payload: Record<string, unknown>, form: FormData, mode: FormMode) => Record<string, unknown>;
  /** Checks made before a save is sent. The row is the one being edited, or null when creating. */
  validate?: (form: FormData, mode: FormMode, row: T | null) => FieldErrors;
  serverErrorHint?: string;
  defaults?: FormData;
  toForm?: (row: T) => FormData;
  rowActions?: (row: T) => ReactNode;
  /** Buttons beside "Add". A function receives the filters as the API sees them, for exports. */
  headerActions?: ReactNode | ((params: Params) => ReactNode);
  /** KPI cards or notes shown between the header and the filters. */
  above?: ReactNode;
  emptyHint?: string;
  /** Said under the title when adding is not possible, so a missing button is explained. */
  createNote?: string;
  /** Export buttons (CSV, Excel, PDF) for this list; the value is the name of the downloaded file. */
  exportName?: string;
  /** Row checkboxes and "Delete selected", through <path>bulk_delete/ (FR-010). */
  bulkDelete?: boolean;
  /** Station set-up (sensors, operators, baselines): adding and changing needs a station administrator. */
  setup?: boolean;
}

/** Rows per page, as last chosen on any list in this browser (25 until one is chosen). */
const PAGE_SIZE_KEY = "climate.pageSize";

function savedPageSize(): number {
  try {
    const size = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0];
  } catch {
    return PAGE_SIZES[0]; // storage unavailable: the default
  }
}

function savePageSize(size: number): void {
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(size));
  } catch {
    /* storage unavailable: the choice lasts while the page is open */
  }
}

/** A text filter that waits for a pause in typing before it asks the server. */
function DebouncedInput({ value, onCommit, ...rest }: { value: string; onCommit: (value: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = useState(value);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (draft === value) return undefined;
    const timer = window.setTimeout(() => commit.current(draft), 350);
    return () => window.clearTimeout(timer);
  }, [draft, value]);
  return <input {...rest} value={draft} onChange={(e) => setDraft(e.target.value)} />;
}

export function ResourcePage<T extends { id: number | string }>({ config, embedded = false }: { config: ResourceConfig<T>; embedded?: boolean }) {
  const session = useSession();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(savedPageSize);
  // "" is the list's own order; otherwise a column key, with "-" in front for highest or newest first.
  const [ordering, setOrdering] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ mode: FormMode; row: T | null } | null>(null);
  const [removing, setRemoving] = useState<T | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string | number>>(new Set());
  // Step two of a bulk delete: the ids, and how many of them the server says it would delete.
  const [bulk, setBulk] = useState<{ ids: Array<string | number>; count: number } | null>(null);
  const [counting, setCounting] = useState(false);

  // The filters as the API reads them; the same values scope the list and any export.
  const filterParams = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of config.filters ?? []) {
      const value = filters[f.name];
      if (value) out[f.name] = f.toParam ? f.toParam(value) : value;
    }
    return out;
  }, [config.filters, filters]);
  // The order travels with the filters, so an export comes out in the order on screen.
  const sortParams = useMemo(() => (ordering ? { ordering } : {}), [ordering]);
  const params = useMemo(() => ({ ...config.baseParams, ...filterParams, ...sortParams, page, page_size: pageSize }),
    [config.baseParams, filterParams, sortParams, page, pageSize]);
  const list = useList<T>(config.path, params);
  const save = useSave<T>(config.path, config.updateMethod);
  const remove = useRemove(config.path);

  const bulkRemove = useAction<BulkDeleteResult, Array<string | number>>((ids) => send("POST", `${config.path}bulk_delete/`, { ids, confirm: true }));

  // Levels 1 to 3 add and edit; deleting, and any change to the station set-up, needs level 1 or 2.
  const admin = canAdminister(session?.user);
  const writable = config.setup ? admin : canWrite(session?.user);
  const mayCreate = writable && config.canCreate !== false;
  const mayEdit = writable && config.canEdit !== false;
  const mayDelete = admin && config.canDelete !== false;
  const mayBulkDelete = mayDelete && config.bulkDelete === true;
  const hasFilters = Object.values(filters).some(Boolean);

  // A selection belongs to the rows in view: it ends when the page or the filters change.
  useEffect(() => { setSelected(new Set()); }, [params]);

  const setFilter = (name: string, value: string) => { setFilters((f) => ({ ...f, [name]: value })); setPage(1); };

  const initial = useMemo<FormData>(() => {
    if (editing?.row) return config.toForm ? config.toForm(editing.row) : rowToForm(config.fields, editing.row as unknown as Record<string, unknown>);
    return rowToForm(config.fields, null, config.defaults);
  }, [editing, config]);

  const submit = async (payload: Record<string, unknown>, form: FormData) => {
    const mode: FormMode = editing?.row ? "edit" : "create";
    const body = config.toPayload ? config.toPayload(payload, form, mode) : payload;
    await save.mutateAsync({ id: editing?.row?.id, data: body, params: config.saveParams?.(form) });
    toast.success(editing?.row ? `The ${config.noun} was updated.` : `The ${config.noun} was created.`);
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync(removing.id);
      toast.success(`The ${config.noun} was deleted.`);
      setRemoving(null);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  // Bulk delete in two steps (FR-010): the server first counts what would go, then the user types
  // DELETE to confirm. Nothing is deleted by the first call or when the dialog is cancelled.
  const askBulkDelete = async () => {
    const ids = [...selected];
    setCounting(true);
    try {
      const reply = await send<BulkDeleteResult>("POST", `${config.path}bulk_delete/`, { ids });
      setBulk({ ids, count: reply.count });
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setCounting(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (!bulk) return;
    try {
      const done = await bulkRemove.mutateAsync(bulk.ids);
      toast.success(`${fmtInt(done.deleted_count)} ${config.noun} records were deleted.`);
      setSelected(new Set());
      setBulk(null);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const toggle = (key: string | number) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleAll = (keys: Array<string | number>, on: boolean) => setSelected((current) => {
    const next = new Set(current);
    for (const key of keys) { if (on) next.add(key); else next.delete(key); }
    return next;
  });

  const createButton = mayCreate && (
    <Button variant="primary" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setEditing({ mode: "create", row: null })}>
      Add {config.noun}
    </Button>
  );
  const listParams = { ...config.baseParams, ...filterParams, ...sortParams };
  const customActions = typeof config.headerActions === "function" ? config.headerActions(listParams) : config.headerActions;
  const headerActions = <>{config.exportName && <ExportButtons path={config.path} params={listParams} name={config.exportName} />}{customActions}</>;
  const description = config.createNote && writable && !mayCreate ? `${config.description} ${config.createNote}` : config.description;

  const showActions = mayEdit || mayDelete || Boolean(config.rowActions);
  return (
    <div>
      {embedded
        ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-3xl text-ink-2">{description}</p>
            <div className="flex flex-wrap items-center gap-2">{headerActions}{createButton}</div>
          </div>
        : <PageHeader title={config.title} description={description} actions={<>{headerActions}{createButton}</>} />}

      {!writable && (
        <div className="mb-4">
          <Notice tone="info">
            {config.setup && canWrite(session?.user)
              ? "Only a station administrator can add or change these records. You can read them."
              : "Your account has read-only access, so nothing can be added or changed here."}
          </Notice>
        </div>
      )}
      {config.above}

      {config.filters && config.filters.length > 0 && (
        <FilterBar onReset={hasFilters ? () => { setFilters({}); setPage(1); } : undefined}>
          {config.filters.map((f) => {
            const id = `filter-${config.noun.replace(/\W+/g, "-")}-${f.name}`;
            return (
              <div key={f.name} className="min-w-[10rem]">
                <label htmlFor={id} className="label">{f.label}</label>
                {f.type === "select" ? (
                  <Choice id={id} value={filters[f.name] ?? ""} onChange={(value) => setFilter(f.name, value)} options={f.options ?? []} emptyLabel="All" />
                ) : f.type === "text" ? (
                  <DebouncedInput id={id} className="input" type="search" placeholder={f.placeholder} value={filters[f.name] ?? ""} onCommit={(value) => setFilter(f.name, value)} />
                ) : (
                  <input id={id} className="input" type="date" value={filters[f.name] ?? ""} onChange={(e) => setFilter(f.name, e.target.value)} />
                )}
              </div>
            );
          })}
        </FilterBar>
      )}

      {mayBulkDelete && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-line bg-subtle px-4 py-2.5" role="status">
          <p className="font-medium text-ink">{fmtInt(selected.size)} selected on this page</p>
          <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />} loading={counting} onClick={askBulkDelete}>Delete selected</Button>
          <Button size="sm" onClick={() => setSelected(new Set())} disabled={counting}>Clear selection</Button>
        </div>
      )}

      <DataTable
        caption={config.title}
        columns={config.columns}
        selection={mayBulkDelete ? { selected, toggle, toggleAll, describe: config.describe } : undefined}
        sorting={config.sortable ? { keys: config.sortable, ordering, onSort: (next) => { setOrdering(next); setPage(1); } } : undefined}
        rows={list.data?.results}
        rowKey={(row) => row.id}
        loading={list.isLoading}
        refreshing={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        empty={hasFilters
          ? { title: "No records match these filters", hint: "Change or clear the filters to see more." }
          : { title: `No ${config.noun} records yet`, hint: config.emptyHint ?? (mayCreate ? `Add the first ${config.noun} to get started.` : undefined), action: createButton || undefined }}
        actions={showActions ? (row) => (
          <span className="inline-flex items-center justify-end gap-0.5">
            {config.rowActions?.(row)}
            {mayEdit && <IconButton label={`Edit ${config.describe(row)}`} onClick={() => setEditing({ mode: "edit", row })}><Pencil className="h-4 w-4" aria-hidden /></IconButton>}
            {mayDelete && <IconButton label={`Delete ${config.describe(row)}`} onClick={() => setRemoving(row)}><Trash2 className="h-4 w-4" aria-hidden /></IconButton>}
          </span>
        ) : undefined}
        footer={list.data && <Pagination page={page} pageSize={pageSize} count={list.data.count} onPage={setPage}
          onPageSize={(size) => { setPageSize(size); savePageSize(size); setPage(1); }} />}
      />

      <FormDialog
        open={editing !== null}
        mode={editing?.mode ?? "create"}
        title={editing?.row ? `Edit ${config.noun}` : `Add ${config.noun}`}
        description="Fields marked * are required."
        fields={config.fields}
        initial={initial}
        validate={config.validate ? (form, mode) => config.validate!(form, mode, editing?.row ?? null) : undefined}
        serverErrorHint={config.serverErrorHint}
        onSubmit={submit}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog open={removing !== null} title={`Delete this ${config.noun}?`} busy={remove.isPending} onConfirm={confirmRemove} onClose={() => setRemoving(null)}>
        <p>You are about to delete <span className="font-semibold text-ink">{removing ? config.describe(removing) : ""}</span>.</p>
        <p>This cannot be undone. The deletion is recorded in the audit trail.</p>
      </ConfirmDialog>
      <ConfirmDialog open={bulk !== null} title={`Delete ${bulk ? fmtInt(bulk.count) : ""} ${config.noun} records?`} confirmLabel="Delete the records"
        requireText="DELETE" busy={bulkRemove.isPending} onConfirm={confirmBulkDelete} onClose={() => setBulk(null)}>
        <p>You selected <span className="font-semibold text-ink">{bulk ? fmtInt(bulk.ids.length) : ""}</span> records. The server will
          delete <span className="font-semibold text-ink">{bulk ? fmtInt(bulk.count) : ""}</span> of them: only records of your own scope are ever deleted.</p>
        <p>Records you did not select are not touched. This cannot be undone and is recorded in the audit trail.</p>
      </ConfirmDialog>
    </div>
  );
}
