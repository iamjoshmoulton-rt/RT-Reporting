import { useState } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import { Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { DollarSign, ShoppingCart, TrendingUp, BarChart3, Percent, Package, PieChart, Zap, X, Download } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import type { CalcTooltipData } from '@/components/ui/CalcTooltip'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { ComparisonChart } from '@/components/charts/ComparisonChart'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import {
  useSalesKpis, useSalesSummary, useSalesByPeriod, useSalesByCustomer,
  useSalesByProduct, useSalesOrders, useSalesKpiDrilldown,
} from '@/api/hooks'
import { api } from '@/api/client'
import { ExportMenu } from '@/components/ui/ExportMenu'
import { SavedFilterBar } from '@/components/ui/SavedFilterBar'
import { formatCurrency, formatNumber } from '@/lib/utils'


interface OrderRow {
  id: number; name: string; state: string; date_order: string
  amount_total: number; amount_untaxed: number; invoice_status: string
  customer_name: string
}

const orderColumns: ColumnDef<OrderRow, unknown>[] = [
  { accessorKey: 'name', header: 'Order #', cell: ({ row, getValue }) => <Link to={`/sales/orders/${row.original.id}`} className="font-normal text-primary hover:underline">{getValue() as string}</Link> },
  { accessorKey: 'customer_name', header: 'Customer' },
  { accessorKey: 'date_order', header: 'Date', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
  { accessorKey: 'amount_total', header: 'Total', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'amount_untaxed', header: 'Untaxed', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'state', header: 'Status', cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  { accessorKey: 'invoice_status', header: 'Invoice', cell: ({ getValue }) => <StatusBadge status={(getValue() as string) || 'draft'} /> },
]

type KpiKey = 'invoiced_revenue' | 'invoiced_margin' | 'margin_percent' | 'units_sold' | 'open_pipeline' | 'open_pipeline_date' | 'max_potential_revenue' | 'avg_sell_price'

const KPI_LABELS: Record<KpiKey, string> = {
  invoiced_revenue: 'Invoiced Revenue',
  invoiced_margin: 'Invoiced Margin',
  margin_percent: 'Inv Margin %',
  units_sold: 'Units Sold (Qty)',
  open_pipeline: 'Open Pipeline',
  open_pipeline_date: 'Open Pipeline (Date)',
  max_potential_revenue: 'Max Potential Revenue',
  avg_sell_price: 'Average Sell Price',
}

interface DrilldownOrderRow {
  id: number; name: string; state: string; date_order: string
  commitment_date: string; amount_total: number; amount_untaxed: number
  margin: number; invoice_status: string; customer_name: string
}

interface DrilldownLineRow {
  order_name: string; product_name: string; qty: number
  price_unit: number; subtotal: number; margin: number
  date_order: string; customer_name: string
}

const drilldownOrderColumns: ColumnDef<DrilldownOrderRow, unknown>[] = [
  { accessorKey: 'name', header: 'Order #', cell: ({ row, getValue }) => <Link to={`/sales/orders/${row.original.id}`} className="font-normal text-primary hover:underline">{getValue() as string}</Link> },
  { accessorKey: 'customer_name', header: 'Customer' },
  { accessorKey: 'date_order', header: 'Order Date', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
  { accessorKey: 'amount_total', header: 'Total', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'margin', header: 'Margin', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'invoice_status', header: 'Invoice Status', cell: ({ getValue }) => <StatusBadge status={(getValue() as string) || 'draft'} /> },
]

const drilldownLineColumns: ColumnDef<DrilldownLineRow, unknown>[] = [
  { accessorKey: 'order_name', header: 'Order #', cell: ({ getValue }) => <span className="font-normal text-primary">{getValue() as string}</span> },
  { accessorKey: 'product_name', header: 'Product' },
  { accessorKey: 'customer_name', header: 'Customer' },
  { accessorKey: 'qty', header: 'Qty', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'price_unit', header: 'Unit Price', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'subtotal', header: 'Subtotal', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'margin', header: 'Margin', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'date_order', header: 'Date', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
]

export function SalesPage() {
  const { dateFrom, dateTo, groupBy, compareTo, setDateFrom, setDateTo, setGroupBy, setCompareTo } = useDateFilterState('sales')
  const [page, setPage] = useState(0)
  const pageSize = 20

  const [search, setSearch] = useState('')

  const [drilldownKpi, setDrilldownKpi] = useState<KpiKey | null>(null)
  const [drilldownPage, setDrilldownPage] = useState(0)
  const [exportLoading, setExportLoading] = useState(false)
  const drilldownPageSize = 25

  const params = { date_from: dateFrom, date_to: dateTo, compare_to: compareTo || undefined }
  const { data: kpis } = useSalesKpis(params)
  const trendLabel = compareTo === 'budget' ? 'vs budget' : compareTo === 'previous_year' ? 'vs prev year' : 'vs prev period'
  useSalesSummary(params)
  const { data: byPeriod } = useSalesByPeriod({ ...params, group_by: groupBy, compare_to: compareTo || undefined })
  const { data: byCustomer } = useSalesByCustomer({ ...params, limit: 10 })
  const { data: byProduct } = useSalesByProduct({ ...params, limit: 10 })
  const { data: ordersData, isLoading: ordersLoading } = useSalesOrders({ ...params, offset: page * pageSize, limit: pageSize, search: search || undefined })
  const { data: drilldownData, isLoading: drilldownLoading } = useSalesKpiDrilldown({
    ...params,
    kpi: drilldownKpi,
    offset: drilldownPage * drilldownPageSize,
    limit: drilldownPageSize,
  })

  const openDrilldown = (kpi: KpiKey) => {
    setDrilldownKpi(kpi)
    setDrilldownPage(0)
  }

  const closeDrilldown = () => {
    setDrilldownKpi(null)
    setDrilldownPage(0)
  }

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
          pageName="sales"
          currentFilters={{ date_from: dateFrom, date_to: dateTo, group_by: groupBy, compare_to: compareTo }}
          onApplyFilter={(f) => { setDateFrom(f.date_from as string); setDateTo(f.date_to as string); setGroupBy(f.group_by as string); setCompareTo((f.compare_to as string) || '') }}
        />
      </div>

      {/* KPI Row 1 */}
      <PermissionGate resource="sales.revenue_chart">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard
            title="Invoiced Revenue"
            value={formatCurrency(kpis?.invoiced_revenue ?? 0)}
            icon={DollarSign}
            trend={kpis?.revenue_trend ?? undefined}
            trendLabel={trendLabel}
            budget={kpis?.invoiced_revenue_budget != null ? formatCurrency(kpis.invoiced_revenue_budget) : undefined}
            onClick={() => openDrilldown('invoiced_revenue')}
            tooltip={{ title: 'Invoiced Revenue', formula: 'SUM(price_subtotal)\nFROM account.move.line\nWHERE move_type = out_invoice\n  AND state = posted', source: 'account.move.line' }}
          />
          <KpiCard
            title="Invoiced Margin"
            value={formatCurrency(kpis?.invoiced_margin ?? 0)}
            subtitle="Device margin reported on P&L"
            icon={TrendingUp}
            trend={kpis?.invoiced_margin_trend ?? undefined}
            trendLabel={trendLabel}
            budget={kpis?.invoiced_margin_budget != null ? formatCurrency(kpis.invoiced_margin_budget) : undefined}
            onClick={() => openDrilldown('invoiced_margin')}
            tooltip={{ title: 'Invoiced Margin', formula: 'SUM(price_subtotal - (qty × standard_price))\nFROM posted out_invoice lines', source: 'account.move.line + product.product' }}
          />
          <KpiCard
            title="Inv Margin %"
            value={`${kpis?.margin_percent ?? 0}%`}
            icon={Percent}
            trend={kpis?.margin_percent_trend ?? undefined}
            trendLabel={trendLabel}
            budget={kpis?.margin_percent_budget != null ? `${kpis.margin_percent_budget}%` : undefined}
            onClick={() => openDrilldown('margin_percent')}
            tooltip={{ title: 'Margin %', formula: '(Invoiced Margin / Invoiced Revenue) × 100' }}
          />
          <KpiCard
            title="Units Sold (Qty)"
            value={formatNumber(kpis?.units_sold ?? 0)}
            icon={Package}
            trend={kpis?.units_sold_trend ?? undefined}
            trendLabel={trendLabel}
            budget={kpis?.units_sold_budget != null ? formatNumber(kpis.units_sold_budget) : undefined}
            onClick={() => openDrilldown('units_sold')}
            tooltip={{ title: 'Units Sold', formula: 'SUM(quantity)\nFROM account.move.line\nWHERE move_type = out_invoice\n  AND state = posted', source: 'account.move.line' }}
          />
          <KpiCard
            title="Open Pipeline"
            value={formatCurrency(kpis?.open_pipeline ?? 0)}
            subtitle="Total confirmed orders that have not been invoiced"
            icon={ShoppingCart}
            trend={kpis?.open_pipeline_trend ?? undefined}
            trendLabel={trendLabel}
            budget={kpis?.open_pipeline_budget != null ? formatCurrency(kpis.open_pipeline_budget) : undefined}
            onClick={() => openDrilldown('open_pipeline')}
            tooltip={{ title: 'Open Pipeline', formula: 'SUM(order_line.price_subtotal)\nFROM sale.order\nWHERE state = sale\n  AND invoice_status ≠ invoiced', source: 'sale.order.line' }}
          />
        </div>
      </PermissionGate>

      {/* KPI Row 2 */}
      <PermissionGate resource="sales.revenue_chart">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard
            title="Open Pipeline (Date)"
            value={formatCurrency(kpis?.open_pipeline_date ?? 0)}
            subtitle="Confirmed orders not invoiced, with delivery date in range"
            icon={PieChart}
            trend={kpis?.open_pipeline_date_trend ?? undefined}
            trendLabel={trendLabel}
            budget={kpis?.open_pipeline_date_budget != null ? formatCurrency(kpis.open_pipeline_date_budget) : undefined}
            onClick={() => openDrilldown('open_pipeline_date')}
            tooltip={{ title: 'Open Pipeline (Date)', formula: 'Same as Open Pipeline, filtered\nto orders with commitment_date\nin selected date range', source: 'sale.order.line' }}
          />
          <KpiCard
            title="Max Potential Revenue"
            value={formatCurrency(kpis?.max_potential_revenue ?? 0)}
            subtitle="Invoiced revenue plus Open Pipeline (Date)"
            icon={Zap}
            trend={kpis?.max_potential_revenue_trend ?? undefined}
            trendLabel={trendLabel}
            budget={kpis?.max_potential_revenue_budget != null ? formatCurrency(kpis.max_potential_revenue_budget) : undefined}
            onClick={() => openDrilldown('max_potential_revenue')}
            tooltip={{ title: 'Max Potential Revenue', formula: 'Invoiced Revenue + Open Pipeline (Date)\nCombined from invoice + SO lines', source: 'account.move.line + sale.order.line' }}
          />
          <KpiCard
            title="Average Sell Price"
            value={formatCurrency(kpis?.avg_sell_price ?? 0)}
            icon={BarChart3}
            trend={kpis?.avg_sell_price_trend ?? undefined}
            trendLabel={trendLabel}
            budget={kpis?.avg_sell_price_budget != null ? formatCurrency(kpis.avg_sell_price_budget) : undefined}
            onClick={() => openDrilldown('avg_sell_price')}
            tooltip={{ title: 'Avg Sell Price', formula: 'Invoiced Revenue / Units Sold\nDerived from posted invoice lines' }}
          />
        </div>
      </PermissionGate>

      {/* Drilldown Panel */}
      {drilldownKpi && (
        <div className="rounded-xl border bg-[var(--card)] shadow-lg overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
            <div>
              <h2 className="text-lg font-heading font-bold text-[var(--foreground)]">
                {KPI_LABELS[drilldownKpi]} — Drilldown
              </h2>
              <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
                {drilldownData?.total?.toLocaleString() ?? '...'} records
                {drilldownData?.type === 'lines' ? ' (order lines)' : ' (orders)'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setExportLoading(true)
                  try {
                    await api.download('/export/sales/kpi-drilldown', {
                      kpi: drilldownKpi,
                      date_from: dateFrom,
                      date_to: dateTo,
                    }, `${drilldownKpi}_drilldown.xlsx`)
                  } finally {
                    setExportLoading(false)
                  }
                }}
                disabled={exportLoading}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                {exportLoading ? 'Exporting…' : 'Export Excel'}
              </button>
              <button
                onClick={closeDrilldown}
                className="rounded-lg p-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="p-0">
            {drilldownData?.type === 'lines' ? (
              <DataTable
                data={(drilldownData.rows ?? []) as unknown as DrilldownLineRow[]}
                columns={drilldownLineColumns}
                total={drilldownData.total}
                pageSize={drilldownPageSize}
                page={drilldownPage}
                onPageChange={setDrilldownPage}
                isLoading={drilldownLoading}
                serverPagination
              />
            ) : (
              <DataTable
                data={(drilldownData?.rows ?? []) as unknown as DrilldownOrderRow[]}
                columns={drilldownOrderColumns}
                total={drilldownData?.total}
                pageSize={drilldownPageSize}
                page={drilldownPage}
                onPageChange={setDrilldownPage}
                isLoading={drilldownLoading}
                serverPagination
              />
            )}
          </div>
        </div>
      )}

      {/* Revenue Chart with Comparison */}
      <PermissionGate resource="sales.revenue_chart">
        {byPeriod && (
          <ComparisonChart
            title="Revenue by Period"
            currentData={byPeriod.current.map(d => ({ period: d.period, value: d.revenue }))}
            comparisonData={byPeriod.comparison?.map(d => ({ period: d.period, value: d.revenue }))}
            valueLabel="Revenue"
          />
        )}
      </PermissionGate>

      {/* By Customer & By Product */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PermissionGate resource="sales.by_customer">
          {byCustomer && (
            <TopItemsChart
              title="Top Customers"
              data={byCustomer.map(c => ({ name: c.customer_name, value: c.total_revenue }))}
            />
          )}
        </PermissionGate>
        <PermissionGate resource="sales.by_product">
          {byProduct && (
            <TopItemsChart
              title="Top Products"
              type="pie"
              data={byProduct.map(p => ({ name: p.product_name, value: p.total_revenue }))}
            />
          )}
        </PermissionGate>
      </div>

      {/* Orders Table */}
      <PermissionGate resource="sales.order_table">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-heading font-bold text-[var(--foreground)]">Sales Orders</h2>
            <ExportMenu module="sales" dateFrom={dateFrom} dateTo={dateTo} />
          </div>
          <DataTable
            data={(ordersData?.orders ?? []) as unknown as OrderRow[]}
            columns={orderColumns}
            total={ordersData?.total}
            pageSize={pageSize}
            page={page}
            onPageChange={setPage}
            isLoading={ordersLoading}
            serverPagination
            searchValue={search}
            onSearchChange={(v) => { setSearch(v); setPage(0) }}
            searchPlaceholder="Search orders or customers…"
          />
        </div>
      </PermissionGate>
    </div>
  )
}
