import { useState } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import { Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { DollarSign, Truck, TrendingDown, BarChart3 } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { ComparisonChart } from '@/components/charts/ComparisonChart'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import {
  useProcurementSummary, useProcurementByPeriod,
  useProcurementByVendor, usePurchaseOrders,
} from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { ExportMenu } from '@/components/ui/ExportMenu'
import { SavedFilterBar } from '@/components/ui/SavedFilterBar'


interface PORow {
  id: number; name: string; state: string; date_order: string
  amount_total: number; amount_untaxed: number; invoice_status: string
  vendor_name: string
}

const poColumns: ColumnDef<PORow, unknown>[] = [
  { accessorKey: 'name', header: 'PO #', cell: ({ getValue, row }) => <Link to={`/procurement/orders/${(row.original as Record<string, unknown>).id}`} className="font-normal text-primary hover:underline">{getValue() as string}</Link> },
  { accessorKey: 'vendor_name', header: 'Vendor' },
  { accessorKey: 'date_order', header: 'Date', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
  { accessorKey: 'amount_total', header: 'Total', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'amount_untaxed', header: 'Untaxed', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'state', header: 'Status', cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  { accessorKey: 'invoice_status', header: 'Invoice', cell: ({ getValue }) => <StatusBadge status={(getValue() as string) || 'draft'} /> },
]

export function ProcurementPage() {
  const { dateFrom, dateTo, groupBy, compareTo, setDateFrom, setDateTo, setGroupBy, setCompareTo } = useDateFilterState('procurement')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const pageSize = 20

  const params = { date_from: dateFrom, date_to: dateTo }
  const { data: summary } = useProcurementSummary(params)
  const { data: byPeriod } = useProcurementByPeriod({ ...params, group_by: groupBy, compare_to: compareTo || undefined })
  const { data: byVendor } = useProcurementByVendor({ ...params, limit: 10 })
  const { data: ordersData, isLoading: ordersLoading } = usePurchaseOrders({ ...params, offset: page * pageSize, limit: pageSize, search: search || undefined })

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
          pageName="procurement"
          currentFilters={{ date_from: dateFrom, date_to: dateTo, group_by: groupBy, compare_to: compareTo }}
          onApplyFilter={(f) => { setDateFrom(f.date_from as string); setDateTo(f.date_to as string); setGroupBy(f.group_by as string); setCompareTo((f.compare_to as string) || '') }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PermissionGate resource="procurement.orders_chart">
          <KpiCard title="Total Spend" value={formatCurrency(summary?.total_spend ?? 0)} icon={DollarSign} />
        </PermissionGate>
        <PermissionGate resource="procurement.orders_chart">
          <KpiCard title="Purchase Orders" value={formatNumber(summary?.total_orders ?? 0)} icon={Truck} />
        </PermissionGate>
        <PermissionGate resource="procurement.orders_chart">
          <KpiCard title="Avg PO Value" value={formatCurrency(summary?.avg_order_value ?? 0)} icon={TrendingDown} />
        </PermissionGate>
        <PermissionGate resource="procurement.spend_chart">
          <KpiCard title="Untaxed Total" value={formatCurrency(summary?.total_untaxed ?? 0)} icon={BarChart3} />
        </PermissionGate>
      </div>

      <PermissionGate resource="procurement.spend_chart">
        {byPeriod && (
          <ComparisonChart
            title="Procurement Spend by Period"
            currentData={byPeriod.current.map(d => ({ period: d.period, value: d.total_spend }))}
            comparisonData={byPeriod.comparison?.map(d => ({ period: d.period, value: d.total_spend }))}
            valueLabel="Spend"
          />
        )}
      </PermissionGate>

      <PermissionGate resource="procurement.by_vendor">
        {byVendor && (
          <TopItemsChart
            title="Top Vendors by Spend"
            data={byVendor.map(v => ({ name: v.vendor_name, value: v.total_spend }))}
          />
        )}
      </PermissionGate>

      <PermissionGate resource="procurement.order_table">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-heading font-bold text-[var(--foreground)]">Purchase Orders</h2>
            <ExportMenu module="procurement" dateFrom={dateFrom} dateTo={dateTo} />
          </div>
          <DataTable
            data={(ordersData?.orders ?? []) as unknown as PORow[]}
            columns={poColumns}
            total={ordersData?.total}
            pageSize={pageSize}
            page={page}
            onPageChange={setPage}
            isLoading={ordersLoading}
            serverPagination
            searchValue={search}
            onSearchChange={(v) => { setSearch(v); setPage(0) }}
            searchPlaceholder="Search POs or vendors…"
          />
        </div>
      </PermissionGate>
    </div>
  )
}
