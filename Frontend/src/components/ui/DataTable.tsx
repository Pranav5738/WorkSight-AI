import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingSkeleton } from './LoadingSkeleton';

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  accessor?: keyof T;
  cell?: (row: T) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
};

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  error?: string | null;
  className?: string;
  filterPlaceholder?: string;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  customFilter?: (row: T, query: string) => boolean;
  pageSizeOptions?: number[];
  initialPageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  toolbar?: ReactNode;
  renderMobileCard?: (row: T) => ReactNode;
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  loading = false,
  error = null,
  className = '',
  filterPlaceholder = 'Search records',
  filterValue,
  onFilterChange,
  customFilter,
  pageSizeOptions = [10, 20, 50],
  initialPageSize = 10,
  emptyTitle = 'No data found',
  emptyDescription = 'Try changing filters or check again later.',
  toolbar,
  renderMobileCard
}: DataTableProps<T>) {
  const [internalQuery, setInternalQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const query = filterValue ?? internalQuery;

  const updateQuery = (value: string) => {
    if (onFilterChange) onFilterChange(value);
    else setInternalQuery(value);
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return data;
    const normalized = query.toLowerCase();
    return data.filter((row) => {
      if (customFilter) return customFilter(row, normalized);
      return JSON.stringify(row).toLowerCase().includes(normalized);
    });
  }, [customFilter, data, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [query, pageSize, data.length]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <div className={`surface-elevated overflow-hidden ${className}`}>
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-4 dark:border-slate-700/60 md:flex-row md:items-center md:justify-between md:px-5">
        <label className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder={filterPlaceholder}
            className="input-field pl-9"
            aria-label={filterPlaceholder}
          />
        </label>
        {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      </div>

      {loading ? (
        <div className="p-4 md:p-5">
          <LoadingSkeleton rows={6} />
        </div>
      ) : error ? (
        <div className="p-4 md:p-5">
          <ErrorState message={error} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-4 md:p-5">
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200/70 bg-slate-100/70 dark:border-slate-700/60 dark:bg-slate-900/40">
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      scope="col"
                      className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400 ${column.headerClassName ?? ''}`}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, rowIndex) => (
                  <tr
                    key={rowKey(row, rowIndex)}
                    className="border-b border-slate-200/60 transition-colors hover:bg-indigo-50/50 dark:border-slate-800 dark:hover:bg-slate-800/55"
                  >
                    {columns.map((column) => (
                      <td key={column.id} className={`px-5 py-3 text-sm text-slate-700 dark:text-slate-200 ${column.cellClassName ?? ''}`}>
                        {column.cell
                          ? column.cell(row)
                          : column.accessor
                          ? String(row[column.accessor] ?? '-')
                          : '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4 md:hidden">
            {pagedRows.map((row, rowIndex) => (
              <div key={rowKey(row, rowIndex)} className="surface-card px-4 py-3">
                {renderMobileCard ? (
                  renderMobileCard(row)
                ) : (
                  <dl className="space-y-2">
                    {columns.map((column) => (
                      <div key={column.id} className="flex justify-between gap-3">
                        <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{column.header}</dt>
                        <dd className="text-sm text-slate-700 dark:text-slate-200">
                          {column.cell
                            ? column.cell(row)
                            : column.accessor
                            ? String(row[column.accessor] ?? '-')
                            : '-'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200/70 px-4 py-3 dark:border-slate-700/60 sm:flex-row sm:items-center sm:justify-between md:px-5">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 dark:text-slate-400">
                <span className="sr-only">Rows per page</span>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="input-field h-9 w-24 py-1 text-xs"
                  aria-label="Rows per page"
                >
                  {pageSizeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option} / page
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
                className="btn-secondary focus-ring h-9 px-3 py-0 text-xs disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-16 text-center text-xs font-medium text-slate-600 dark:text-slate-300">
                {page} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                disabled={page >= pageCount}
                className="btn-secondary focus-ring h-9 px-3 py-0 text-xs disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
