import { useState } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import { Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Factory, CheckCircle, Box, Clock } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { ComparisonChart } from '@/components/charts/ComparisonChart'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import {
  useManufacturingSummary, useProductionByPeriod,
  useTopProductsManufactured, useManufacturingOrders,
} from '@/api/hooks'
import { formatNumber } from '@/lib/utils'
import { ExportMenu } from '@/components/ui/ExportMenu'
import { SavedFilterBar } from '@/components/ui/SavedFilterBar'


interface MORow {
  id: number; name: string; state: string; priority: string
  product_name: string; product_qty: number; origin: string
  date_start: string; date_finished: string; create_date: string
}

const moColumns: ColumnDef<MORow, unknown>[] = [
  { accessorKey: 'name', header: 'MO #', cell: ({ getValue, row }) => <Link to={`/manufacturing/orders/${(row.original as Record<string, unknown>).id}`} className="font-normal text-primary hover:underline">{getValue() as string}</Link> },
  { accessorKey: 'product_name', header: 'Product' },
  { accessorKey: 'product_qty', header: 'Qty', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'state', header: 'Status', cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  { accessorKey: 'origin', header: 'Source' },
  { accessorKey: 'date_start', header: 'Start', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
  { accessorKey: 'date_finished', header: 'Finished', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
]

export function ManufacturingPage() {
  const { dateFrom, dateTo, groupBy, compareTo, setDateFrom, setDateTo, setGroupBy, setCompareTo } = useDateFilterState('manufacturing')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const pageSize = 20

  const params = { date_from: dateFrom, date_to: dateTo }
  const { data: summary } = useManufacturingSummary(params)
  const { data: byPeriod } = useProductionByPeriod({ ...params, group_by: groupBy, compare_to: compareTo || undefined })
  const { data: topProducts } = useTopProductsManufactured({ ...params, limit: 10 })
  const { data: ordersData, isLoading: ordersLoading } = useManufacturingOrders({ ...params, offset: page * pageSize, limit: pageSize, search: search || undefined })

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="space-y-3">
        <DateRangeFilter
          dateFrom={dateFrom} dateTo={dateTo}
          onDateFromChange={setDateFrom} onDateToChange={setDateTo}
          groupBy={groupBy} onGroupByChange={setGroupBy}
          compareTo={compareTo} onCompareToChange={setCompareTo}
        />
        <SavedFilterBar
          pageName="manufacturing"
          currentFilters={{ date_from: dateFrom, date_to: dateTo, group_by: groupBy, compare_to: compareTo }}
          onApplyFilter={(f) => { setDateFrom(f.date_from as string); setDateTo(f.date_to as string); setGroupBy(f.group_by as string); setCompareTo((f.compare_to as string) || '') }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PermissionGate resource="manufacturing.summary">
          <KpiCard title="Active MOs" value={formatNumber(summary?.active_mos ?? 0)} icon={Factory}
            tooltip={{ title: 'Active MOs', formula: 'COUNT(mrp.production)\nWHERE state IN (confirmed, progress)\n  AND date_start in selected range', source: 'mrp.production' }} />
        </PermissionGate>
        <PermissionGate resource="manufacturing.summary">
          <KpiCard title="Completed" value={formatNumber(summary?.completed ?? 0)} icon={CheckCircle}
            tooltip={{ title: 'Completed', formula: 'COUNT(mrp.production)\nWHERE state = done\n  AND date_finished in selected range', source: 'mrp.production' }} />
        </PermissionGate>
        <PermissionGate resource="manufacturing.summary">
          <KpiCard title="Units Produced" value={formatNumber(summary?.units_produced ?? 0)} icon={Box}
            tooltip={{ title: 'Units Produced', formula: 'SUM(qty_produced)\nFROM mrp.production\nWHERE state = done\n  AND date_finished in selected range', source: 'mrp.production' }} />
        </PermissionGate>
        <PermissionGate resource="manufacturing.summary">
          <KpiCard title="Avg Cycle (days)" value={String(summary?.avg_cycle_days ?? 0)} icon={Clock}
            tooltip={{ title: 'Avg Cycle (days)', formula: 'AVG(date_finished - date_start)\nFROM mrp.production\nWHERE state = done\n  AND date_finished in selected range', source: 'mrp.production' }} />
        </PermissionGate>
      </div>

      <PermissionGate resource="manufacturing.production_chart">
        {byPeriod && (
          <ComparisonChart
            title="Production by Period"
            currentData={byPeriod.current.map((d: { period: string; units_produced: number }) => ({ period: d.period, value: d.units_produced }))}
            comparisonData={byPeriod.comparison?.map((d: { period: string; units_produced: number }) => ({ period: d.period, value: d.units_produced }))}
            valueLabel="Units"
          />
        )}
      </PermissionGate>

      <PermissionGate resource="manufacturing.top_products">
        {topProducts && (
          <TopItemsChart
            title="Top Products Manufactured"
            data={topProducts.map((p: { product_name: string; units_produced: number }) => ({ name: p.product_name, value: p.units_produced }))}
          />
        )}
      </PermissionGate>

      <PermissionGate resource="manufacturing.order_table">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-heading font-bold text-[var(--foreground)]">Manufacturing Orders</h2>
            <ExportMenu module="manufacturing" dateFrom={dateFrom} dateTo={dateTo} />
          </div>
          <DataTable
            data={(ordersData?.orders ?? []) as unknown as MORow[]}
            columns={moColumns}
            total={ordersData?.total}
            pageSize={pageSize}
            page={page}
            onPageChange={setPage}
            isLoading={ordersLoading}
            serverPagination
            searchValue={search}
            onSearchChange={(v) => { setSearch(v); setPage(0) }}
            searchPlaceholder="Search MOs or products…"
          />
        </div>
      </PermissionGate>
    </div>
  )
}
