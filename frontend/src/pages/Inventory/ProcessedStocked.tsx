import { useState } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import { type ColumnDef } from '@tanstack/react-table'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { DataTable } from '@/components/tables/DataTable'
import { useStockMovements } from '@/api/hooks'
import { formatNumber } from '@/lib/utils'
import { SavedFilterBar } from '@/components/ui/SavedFilterBar'

interface MoveRow {
  id: number; reference: string; product_name: string
  quantity: number; date: string; origin: string
  source_location: string; dest_location: string
}

function displayName(val: unknown): string {
  if (typeof val === 'string') return val
  if (val && typeof val === 'object') {
    const obj = val as Record<string, string>
    return obj.en_US ?? obj.en ?? Object.values(obj)[0] ?? '-'
  }
  return '-'
}

const moveColumns: ColumnDef<MoveRow, unknown>[] = [
  { accessorKey: 'reference', header: 'Reference', cell: ({ getValue }) => <span className="font-normal text-primary">{(getValue() as string) || '-'}</span> },
  { accessorKey: 'product_name', header: 'Product', cell: ({ getValue }) => displayName(getValue()) },
  { accessorKey: 'quantity', header: 'Qty', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'source_location', header: 'From' },
  { accessorKey: 'dest_location', header: 'To' },
  { accessorKey: 'date', header: 'Date', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
  { accessorKey: 'origin', header: 'Source Doc' },
]

export function ProcessedStockedPage() {
  const { dateFrom, dateTo, groupBy, compareTo, setDateFrom, setDateTo, setGroupBy, setCompareTo, setDateRange } = useDateFilterState('inventory_processed')
  const [page, setPage] = useState(0)
  const pageSize = 25

  const { data: movesData, isLoading } = useStockMovements({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    offset: page * pageSize,
    limit: pageSize,
  })

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <DateRangeFilter
          dateFrom={dateFrom} dateTo={dateTo}
          onDateFromChange={setDateFrom} onDateToChange={setDateTo} onDateRangeChange={setDateRange}
        />
        <SavedFilterBar
          pageName="inventory_processed"
          currentFilters={{ date_from: dateFrom, date_to: dateTo, group_by: groupBy, compare_to: compareTo }}
          onApplyFilter={(f) => { setDateFrom(f.date_from as string); setDateTo(f.date_to as string); setGroupBy(f.group_by as string); setCompareTo((f.compare_to as string) || '') }}
        />
      </div>

      <PermissionGate resource="inventory.movements">
        <DataTable
          data={(movesData?.moves ?? []) as unknown as MoveRow[]}
          columns={moveColumns}
          total={movesData?.total}
          pageSize={pageSize}
          page={page}
          onPageChange={setPage}
          isLoading={isLoading}
          serverPagination
        />
      </PermissionGate>
    </div>
  )
}
