// Building blocks shared by the admin pages: URL-backed list params, table card, confirm-and-run dialog.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, Pagination, Select, Skeleton, useToast } from '@/components/ui';
import { statusInfo, type StatusDomain } from '@/lib/status';

export const PAGE_SIZE = 25;
export const TR = 'border-t border-ink-100';
export const TD = 'px-5 py-3 align-top';

/** Inclusive row range for a 1-based page, as `.range()` expects. */
export const pageRange = (page: number) => [(page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1] as const;

/** Resolves a `{ count: 'exact' }` query into rows + total, throwing on error. */
export async function paged<T>(query: PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>) {
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export const shortId = (id: string | null | undefined) => (id ? id.slice(0, 8) : '—');
export const humanize = (s: string) => (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, ' ');

/** Filters, search and page numbers live in the URL so lists survive reloads and back/forward. */
export function useListParams() {
  const [params, setParams] = useSearchParams();
  return {
    get: (key: string, fallback = '') => params.get(key) ?? fallback,
    page: (key = 'page') => Math.max(1, Math.floor(Number(params.get(key))) || 1),
    /** Updates the given keys; null or empty values are removed. */
    set: (updates: Record<string, string | number | null>) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(updates)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        return next;
      }),
  };
}

export function SearchBox({ value, label, onSearch }: { value: string; label: string; onSearch: (q: string) => void }) {
  return (
    <form
      role="search"
      className="flex min-w-0 flex-1 gap-2 sm:max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(String(new FormData(e.currentTarget).get('q') ?? '').trim());
      }}
    >
      <Input key={value} name="q" type="search" defaultValue={value} placeholder={label} aria-label={label} className="h-9 py-1.5 text-sm" />
      <Button type="submit" variant="secondary" size="icon" aria-label="Search">
        <Search className="size-4" aria-hidden="true" />
      </Button>
    </form>
  );
}

export function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: [value: string, label: string][]; onChange: (value: string) => void }) {
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-auto min-w-44 py-1.5 text-sm">
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </Select>
  );
}

export const statusOptions = (domain: StatusDomain, statuses: string[]): [string, string][] => [
  ['', 'All statuses'],
  ...statuses.map((s): [string, string] => [s, statusInfo(domain, s)[0]]),
];

interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

interface DataTableProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  columns: string[];
  query: QueryLike;
  /** Rows loaded; undefined while loading. */
  rowCount: number | undefined;
  emptyTitle: string;
  emptyDescription?: ReactNode;
  pagination?: { page: number; total: number; onChange: (page: number) => void };
  children: ReactNode;
}

/** White card with a horizontally scrollable table plus loading, empty, error and pagination states. */
export function DataTable({ title, description, actions, toolbar, columns, query, rowCount, emptyTitle, emptyDescription, pagination, children }: DataTableProps) {
  return (
    <Card>
      <CardHeader title={title} description={description} actions={actions} />
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-5 py-3">{toolbar}</div>}
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : rowCount === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} scope="col" className="px-5 py-3 text-left text-[13px] font-medium whitespace-nowrap text-ink-500">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody aria-busy={query.isPending || undefined}>
              {query.isPending
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i} className={TR}>
                      <td colSpan={columns.length} className="px-5 py-3"><Skeleton className="h-6" /></td>
                    </tr>
                  ))
                : children}
            </tbody>
          </table>
        </div>
      )}
      {pagination && (
        <div className="px-5 pb-4 empty:hidden">
          <Pagination page={pagination.page} pageSize={PAGE_SIZE} total={pagination.total} onChange={pagination.onChange} />
        </div>
      )}
    </Card>
  );
}

export interface PendingAction {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  note?: { label: string; required?: boolean; placeholder?: string };
  success: string;
  run: (note: string) => Promise<unknown>;
}

/** Confirms an action, runs it, refreshes admin data and toasts. Failures stay inside the dialog. */
export function ActionDialog({ action, onClose }: { action: PendingAction | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: ({ action, note }: { action: PendingAction; note: string }) => action.run(note),
    onSuccess: (_data, { action }) => {
      toast(action.success);
      return qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  return (
    <ConfirmDialog
      open={!!action}
      onClose={onClose}
      title={action?.title ?? ''}
      description={action?.description}
      confirmLabel={action?.confirmLabel}
      danger={action?.danger}
      note={action?.note}
      onConfirm={(note) => (action ? mutation.mutateAsync({ action, note }) : undefined)}
    />
  );
}
