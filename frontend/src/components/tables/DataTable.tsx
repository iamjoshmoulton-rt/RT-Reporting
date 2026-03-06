import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  total?: number
  pageSize?: number
  page?: number
  onPageChange?: (page: number) => void
  onRowClick?: (row: T) => void
  isLoading?: boolean
  serverPagination?: boolean
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
}

export function DataTable<T>({
  data, columns, total, pageSize = 20, page = 0,
  onPageChange, onRowClick, isLoading, serverPagination,
  searchValue, onSearchChange, searchPlaceholder,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [localSearch, setLocalSearch] = useState(searchValue ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setLocalSearch(searchValue ?? '')
  }, [searchValue])

  const handleSearchInput = (val: string) => {
    setLocalSearch(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onSearchChange?.(val)
    }, 400)
  }

  const clearSearch = () => {
    setLocalSearch('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    onSearchChange?.('')
  }

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(!serverPagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  })

  const totalPages = total ? Math.ceil(total / pageSize) : table.getPageCount()

  return (
    <div className="rounded-xl border bg-[var(--card)] shadow-sm overflow-hidden">
      {onSearchChange && (
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder={searchPlaceholder ?? 'Search...'}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-9 pr-8 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-primary focus:outline-none"
            />
            {localSearch && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-[var(--border)] bg-[var(--muted)]/50">
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className={cn(
                      'px-4 py-3 text-left text-xs font-normal uppercase tracking-wider text-[var(--muted-foreground)]',
                      header.column.getCanSort() && 'cursor-pointer select-none hover:text-[var(--foreground)]'
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="ml-1">
                          {header.column.getIsSorted() === 'asc' ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-30" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto" />
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[var(--muted-foreground)]">
                  No data available
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    'border-b border-[var(--border)] last:border-0 transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-primary/5'
                  )}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3 text-sm text-[var(--card-foreground)]">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(totalPages > 1 || total) && (
        <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
          <p className="text-sm text-[var(--muted-foreground)]">
            {total ? `${total.toLocaleString()} total records` : `Page ${page + 1} of ${totalPages}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => serverPagination ? onPageChange?.(page - 1) : table.previousPage()}
              disabled={serverPagination ? page <= 0 : !table.getCanPreviousPage()}
              className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--muted-foreground)] hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-[var(--foreground)] min-w-[4rem] text-center">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => serverPagination ? onPageChange?.(page + 1) : table.nextPage()}
              disabled={serverPagination ? (page + 1) >= totalPages : !table.getCanNextPage()}
              className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--muted-foreground)] hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
