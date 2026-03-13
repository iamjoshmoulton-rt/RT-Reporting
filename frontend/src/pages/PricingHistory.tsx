import { useState, useMemo } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import { DollarSign, Package, Tag } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { CalcTooltip } from '@/components/ui/CalcTooltip'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import { PermissionGate } from '@/components/ui/PermissionGate'
import {
  usePricingHistoryOverview,
  usePricingHistoryFilterOptions,
} from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'

export default function PricingHistory() {
  const { dateFrom, dateTo, setDateFrom, setDateTo, setDateRange } = useDateFilterState('pricing-history')

  // Multi-select filter state
  const [channelIds, setChannelIds] = useState<number[]>([])
  const [categoryIds, setCategoryIds] = useState<number[]>([])

  const params = {
    date_from: dateFrom,
    date_to: dateTo,
    channel_ids: channelIds.length ? channelIds : undefined,
    category_ids: categoryIds.length ? categoryIds : undefined,
  }

  const { data, isLoading } = usePricingHistoryOverview(params)
  const { data: filterOpts } = usePricingHistoryFilterOptions()

  const kpis = data?.kpis

  // Table columns — Top Products
  const productCols: ColumnDef<any, any>[] = [
    { accessorKey: 'product', header: 'Channel', cell: ({ getValue }) => (
      <span className="text-xs">{getValue() as string}</span>
    ) },
    { accessorKey: 'qty', header: 'Quantity', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'asp', header: 'ASP', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  // Table columns — By Channel
  const channelCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Channel' },
    { accessorKey: 'qty', header: 'Quantity', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'asp', header: 'ASP', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  // Table columns — By Category
  const categoryCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Category' },
    { accessorKey: 'qty', header: 'Quantity', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'asp', header: 'ASP', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  // Multi-select toggle helper
  const toggleFilter = (ids: number[], setIds: (v: number[]) => void, id: number) => {
    setIds(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  const chipCls = (active: boolean) =>
    `inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
      active
        ? 'bg-primary text-white'
        : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
    }`

  return (
    <PermissionGate resource="pricing_history.view">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-heading font-bold text-[var(--foreground)]">Pricing History (Invoice Data)</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Invoice-based pricing analysis — units sold, revenue & ASP by product variant</p>
        </div>

        {/* Date Range */}
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onDateRangeChange={setDateRange}
        />

        {/* Channel Filter Chips */}
        {filterOpts?.channels && (
          <div>
            <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Channels</label>
            <div className="flex flex-wrap gap-1.5">
              {filterOpts.channels.map((c: any) => (
                <span
                  key={c.id}
                  className={chipCls(channelIds.includes(c.id))}
                  onClick={() => toggleFilter(channelIds, setChannelIds, c.id)}
                >
                  {c.name}
                  {channelIds.includes(c.id) && (
                    <span className="ml-0.5 text-white/80">×</span>
                  )}
                </span>
              ))}
              {channelIds.length > 0 && (
                <span
                  className="inline-flex items-center px-2 py-1 text-xs text-red-400 cursor-pointer hover:text-red-300"
                  onClick={() => setChannelIds([])}
                >
                  Clear
                </span>
              )}
            </div>
          </div>
        )}

        {/* Category Filter Chips */}
        {filterOpts?.categories && (
          <div>
            <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">Categories</label>
            <div className="flex flex-wrap gap-1.5">
              {filterOpts.categories.map((c: any) => (
                <span
                  key={c.id}
                  className={chipCls(categoryIds.includes(c.id))}
                  onClick={() => toggleFilter(categoryIds, setCategoryIds, c.id)}
                >
                  {c.name}
                  {categoryIds.includes(c.id) && (
                    <span className="ml-0.5 text-white/80">×</span>
                  )}
                </span>
              ))}
              {categoryIds.length > 0 && (
                <span
                  className="inline-flex items-center px-2 py-1 text-xs text-red-400 cursor-pointer hover:text-red-300"
                  onClick={() => setCategoryIds([])}
                >
                  Clear
                </span>
              )}
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard title="Units Sold" value={kpis ? formatNumber(kpis.units_sold) : undefined} icon={Package} accent="#a855f7" loading={isLoading}
            tooltip={{ title: 'Units Sold', formula: 'SUM(qty_invoiced) from sale.order.line\nWHERE order state in (sale, done)\nAND invoice_status = invoiced\nExcludes: Accessories, Deliveries, Headphones', source: 'sale.order.line' }} />
          <KpiCard title="Total Revenue" value={kpis ? formatCurrency(kpis.total_revenue) : undefined} icon={DollarSign} accent="#48cae1" loading={isLoading}
            tooltip={{ title: 'Total Revenue', formula: 'SUM(price_subtotal) from sale.order.line\nWHERE order state in (sale, done)\nAND invoice_status = invoiced\nExcludes: Accessories, Deliveries, Headphones', source: 'sale.order.line' }} />
          <KpiCard title="ASP" value={kpis ? formatCurrency(kpis.asp) : undefined} icon={Tag} accent="#f97316" loading={isLoading}
            tooltip={{ title: 'Average Selling Price', formula: 'Total Revenue / Units Sold', source: 'Derived' }} />
        </div>

        {/* Channel Pie Chart + Top Products Table */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Channel Pie */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
            <TopItemsChart
              data={(data?.by_channel ?? []).map((c: any) => ({ name: c.name, value: c.revenue }))}
              title="Revenue By Channel"
              type="pie"
            />
          </div>

          {/* Top Products Table (spans 2 cols) */}
          <div className="lg:col-span-2">
            <Section title="Top Products" tooltip={{ title: 'Top Products', formula: 'Qty, revenue & ASP grouped by\nproduct variant (product.product)\nSorted by quantity desc, top 100\nFROM invoiced sale.order.line', source: 'sale.order.line → product.product' }}>
              <DataTable data={data?.top_products ?? []} columns={productCols} isLoading={isLoading} />
            </Section>
          </div>
        </div>

        {/* Tables: By Channel + By Category */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="By Channel" tooltip={{ title: 'By Channel', formula: 'Revenue, qty & ASP grouped by\nsales team (crm.team)\nFROM invoiced sale.order.line', source: 'sale.order.line → crm.team' }}>
            <DataTable data={data?.by_channel ?? []} columns={channelCols} isLoading={isLoading} />
          </Section>
          <Section title="By Category" tooltip={{ title: 'By Category', formula: 'Revenue, qty & ASP grouped by\nproduct.category\nFROM invoiced sale.order.line', source: 'sale.order.line → product.category' }}>
            <DataTable data={data?.by_category ?? []} columns={categoryCols} isLoading={isLoading} />
          </Section>
        </div>
      </div>
    </PermissionGate>
  )
}

function Section({ title, children, tooltip }: { title: string; children: React.ReactNode; tooltip?: { title: string; formula: string; source?: string } }) {
  return (
    <div>
      <h2 className="text-lg font-heading font-bold text-[var(--foreground)] mb-3 flex items-center gap-2">
        {title}
        {tooltip && <CalcTooltip {...tooltip} />}
      </h2>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-auto">
        {children}
      </div>
    </div>
  )
}
