/**
 * The one table of the app (shadcn/ui Table): loading, empty and error states, sorting by a column,
 * row actions and pagination.
 */
import { useId, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { Checkbox } from "./shadcn/checkbox";
import { Skeleton } from "./shadcn/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "./shadcn/table";
import { Button, Choice, EmptyState, ErrorState, cx } from "./ui";
import { fmtInt } from "../lib/format";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Numbers are right aligned so their digits line up. */
  align?: "left" | "right";
  className?: string;
}

interface Props<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  /** True while a new page or filter loads: the old rows stay, dimmed, so the layout does not jump. */
  refreshing?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: { title: string; hint?: ReactNode; action?: ReactNode };
  actions?: (row: T) => ReactNode;
  footer?: ReactNode;
  /** Row checkboxes, for an action on several rows at once (bulk delete). */
  selection?: Selection<T>;
  /** Column headers that sort the list when clicked. */
  sorting?: Sorting;
}

export interface Selection<T> {
  selected: ReadonlySet<string | number>;
  toggle: (key: string | number) => void;
  /** Select or clear every row on the page. */
  toggleAll: (keys: Array<string | number>, on: boolean) => void;
  describe: (row: T) => string;
}

export interface Sorting {
  /** The column keys the server sorts by (Dataset.sorts in backend/reports/datasets.py). */
  keys: ReadonlyArray<string>;
  /** As the API reads it (?ordering=): "" for the list's own order, "key" ascending, "-key" descending. */
  ordering: string;
  onSort: (ordering: string) => void;
}

/** A click sorts by the column, a second click reverses it, a third returns to the list's own order. */
const nextOrdering = (key: string, ordering: string): string => (ordering === key ? `-${key}` : ordering === `-${key}` ? "" : key);

function HeaderCell<T>({ column, sorting }: { column: Column<T>; sorting?: Sorting }) {
  const right = column.align === "right";
  const className = cx("h-auto whitespace-nowrap px-4 py-2.5 text-xs font-semibold", right && "text-right");
  if (!sorting?.keys.includes(column.key)) return <TableHead scope="col" className={className}>{column.header}</TableHead>;
  const state = sorting.ordering === column.key ? "ascending" : sorting.ordering === `-${column.key}` ? "descending" : undefined;
  const Icon = state === "ascending" ? ArrowUp : state === "descending" ? ArrowDown : ChevronsUpDown;
  return (
    <TableHead scope="col" className={className} aria-sort={state}>
      <button type="button" onClick={() => sorting.onSort(nextOrdering(column.key, sorting.ordering))}
        title={state === "ascending" ? "Sorted lowest first. Click for highest first." : state === "descending" ? "Sorted highest first. Click for the usual order." : "Click to sort by this column"}
        className={cx("-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-line/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          right && "flex-row-reverse", state && "text-ink")}>
        {column.header}
        <Icon className={cx("h-3.5 w-3.5 shrink-0", !state && "opacity-50")} aria-hidden />
      </button>
    </TableHead>
  );
}

/** Grey rows in the table's own shape while the first page loads, so the page does not jump when it arrives. */
function LoadingTable<T>({ caption, columns, selection, actions }: { caption: string; columns: Column<T>[]; selection: boolean; actions: boolean }) {
  return (
    <div className="card overflow-hidden" role="status" aria-label={`Loading ${caption}`}>
      <Table className="border-collapse text-left">
        <TableHeader>
          <TableRow className="bg-subtle hover:bg-subtle">
            {selection && <TableHead className="w-10 px-4" />}
            {columns.map((c) => <HeaderCell key={c.key} column={c} />)}
            {actions && <TableHead className="h-auto px-4 py-2.5 text-right text-xs font-semibold">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <TableRow key={row} className="hover:bg-transparent">
              {selection && <TableCell className="px-4 py-3"><Skeleton className="h-4 w-4" /></TableCell>}
              {columns.map((c, i) => (
                <TableCell key={c.key} className="px-4 py-3">
                  {/* Widths vary by row and column, as text does. */}
                  <Skeleton className={cx("h-4", ["w-24", "w-32", "w-16", "w-28", "w-20"][(row + i) % 5], c.align === "right" && "ml-auto")} />
                </TableCell>
              ))}
              {actions && <TableCell className="px-4 py-3"><Skeleton className="ml-auto h-4 w-14" /></TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function DataTable<T>({ caption, columns, rows, rowKey, loading, refreshing, error, onRetry, empty, actions, footer, selection, sorting }: Props<T>) {
  if (error) return <div className="card"><ErrorState error={error} onRetry={onRetry} /></div>;
  if (loading || !rows) return <LoadingTable caption={caption} columns={columns} selection={Boolean(selection)} actions={Boolean(actions)} />;
  if (rows.length === 0) {
    return <div className="card"><EmptyState title={empty?.title ?? "Nothing to show"} hint={empty?.hint} action={empty?.action} /></div>;
  }
  const keys = rows.map(rowKey);
  const chosen = selection ? keys.filter((key) => selection.selected.has(key)).length : 0;
  // Some rows of the page ticked: the box shows a dash, and a click ticks the rest.
  const allState = chosen === 0 ? false : chosen === keys.length ? true : "indeterminate";
  return (
    <div className="card overflow-hidden">
      <Table containerClassName={cx("transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing} className="border-collapse text-left">
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow className="bg-subtle hover:bg-subtle">
            {selection && (
              <TableHead className="w-10 px-4">
                <Checkbox aria-label="Select every row on this page" checked={allState}
                  onCheckedChange={() => selection.toggleAll(keys, allState !== true)} />
              </TableHead>
            )}
            {columns.map((c) => <HeaderCell key={c.key} column={c} sorting={sorting} />)}
            {actions && <TableHead scope="col" className="h-auto px-4 py-2.5 text-right text-xs font-semibold">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = rowKey(row);
            const ticked = selection?.selected.has(key) ?? false;
            return (
              <TableRow key={key} data-state={ticked ? "selected" : undefined}>
                {selection && (
                  <TableCell className="w-10 px-4 py-2.5">
                    <Checkbox aria-label={`Select ${selection.describe(row)}`} checked={ticked} onCheckedChange={() => selection.toggle(key)} />
                  </TableCell>
                )}
                {columns.map((c) => (
                  <TableCell key={c.key} className={cx("px-4 py-2.5 text-ink", c.align === "right" && "text-right", c.className)}>{c.cell(row)}</TableCell>
                ))}
                {actions && <TableCell className="whitespace-nowrap px-4 py-1.5 text-right">{actions(row)}</TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {footer}
    </div>
  );
}

/**
 * The same table without its own card, loading or empty handling: for a table inside a card or a
 * dialog, such as the table view of a chart. Long tables scroll under a fixed header.
 */
export function PlainTable<T>({ caption, columns, rows, rowKey, scroll = true }: {
  caption: string; columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string | number; scroll?: boolean;
}) {
  return (
    <Table containerClassName={cx("rounded-md border border-line", scroll && "max-h-[26rem]")} className="border-collapse text-left">
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader className="sticky top-0 z-10">
        <TableRow className="bg-subtle hover:bg-subtle">
          {columns.map((c) => (
            <TableHead key={c.key} scope="col" className={cx("h-auto whitespace-nowrap px-3 py-2 text-xs font-semibold", c.align === "right" && "text-right")}>{c.header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={rowKey(row)}>
            {columns.map((c) => (
              <TableCell key={c.key} className={cx("px-3 py-2 text-ink", c.align === "right" && "text-right", c.className)}>{c.cell(row)}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The page sizes a list offers. The server answers up to 500 rows a page (core/pagination.py). */
export const PAGE_SIZES = [25, 50, 100];

/** Pass onPageSize to let the user choose how many rows a page shows. */
export function Pagination({ page, pageSize, count, onPage, onPageSize }: {
  page: number; pageSize: number; count: number; onPage: (page: number) => void; onPageSize?: (size: number) => void;
}) {
  const sizeId = useId();
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const from = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(count, page * pageSize);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5" aria-label="Pagination">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-xs text-ink-2">
          Showing <span className="font-semibold text-ink">{fmtInt(from)}</span> to <span className="font-semibold text-ink">{fmtInt(to)}</span> of{" "}
          <span className="font-semibold text-ink">{fmtInt(count)}</span>
        </p>
        {onPageSize && (
          <div className="flex items-center gap-2">
            <label htmlFor={sizeId} className="text-xs text-ink-2">Rows per page</label>
            <Choice id={sizeId} value={String(pageSize)} onChange={(value) => onPageSize(Number(value))} className="h-8 min-h-0 w-[4.5rem] text-xs"
              options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft className="h-3.5 w-3.5" aria-hidden />}>Previous</Button>
        <span className="text-xs text-ink-2">Page {fmtInt(page)} of {fmtInt(pages)}</span>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next<ChevronRight className="h-3.5 w-3.5" aria-hidden /></Button>
      </div>
    </nav>
  );
}
