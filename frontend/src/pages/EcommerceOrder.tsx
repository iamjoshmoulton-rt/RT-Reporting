import { useState } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import {
  DollarSign, ShoppingCart, Package, Tag,
} from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { CalcTooltip } from '@/components/ui/CalcTooltip'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import { PermissionGate } from '@/components/ui/PermissionGate'
import {
  useEcommerceOrderOverview,
  useEcommerceFilterOptions,
} from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'

export default function EcommerceOrder() {
  const { dateFrom, dateTo, setDateFrom, setDateTo, setDateRange } = useDateFilterState('ecom-order')

  // Multi-select filter state
  const [channelIds, setChannelIds] = useState<number[]>([])
  const [categoryIds, setCategoryIds] = useState<number[]>([])

  const params = {
    date_from: dateFrom,
    date_to: dateTo,
    channel_ids: channelIds.length ? channelIds : undefined,
    category_ids: categoryIds.length ? categoryIds : undefined,
  }

  const { data, isLoading } = useEcommerceOrderOverview(params)
  const { data: filterOpts } = useEcommerceFilterOptions()

  const kpis = data?.kpis

  // Table columns
  const channelCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Channel' },
    { accessorKey: 'order_count', header: 'Orders', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'qty', header: 'Quantity', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'asp', header: 'ASP', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const productCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Product' },
    { accessorKey: 'qty', header: 'Quantity', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'asp', header: 'ASP', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const categoryCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Category' },
    { accessorKey: 'order_count', header: 'Orders', cell: ({ getValue }) => formatNumber(getValue() as number) },
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
    <PermissionGate resource="ecommerce.order_view">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-heading font-bold text-[var(--foreground)]">E-Commerce (Order Data)</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Order-based e-commerce dashboard — sales orders, channel & product performance</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Order Revenue" value={kpis ? formatCurrency(kpis.order_revenue) : undefined} icon={DollarSign} accent="#48cae1" loading={isLoading}
            tooltip={{ title: 'Order Revenue', formula: 'SUM(amount_untaxed) from sale.order\nWHERE state in (sale, done)\nDate range applied to date_order', source: 'sale.order' }} />
          <KpiCard title="Order Count" value={kpis ? formatNumber(kpis.order_count) : undefined} icon={ShoppingCart} accent="#22c55e" loading={isLoading}
            tooltip={{ title: 'Order Count', formula: 'COUNT(DISTINCT sale.order)\nWHERE state in (sale, done)', source: 'sale.order' }} />
          <KpiCard title="Units Sold" value={kpis ? formatNumber(kpis.units_sold) : undefined} icon={Package} accent="#a855f7" loading={isLoading}
            tooltip={{ title: 'Units Sold', formula: 'SUM(product_uom_qty) from sale.order.line\nWHERE order state in (sale, done)\nExcludes non-device categories', source: 'sale.order.line' }} />
          <KpiCard title="ASP" value={kpis ? formatCurrency(kpis.asp) : undefined} icon={Tag} accent="#f97316" loading={isLoading}
            tooltip={{ title: 'Average Selling Price', formula: 'Order Revenue / Units Sold' }} />
        </div>

        {/* Chart + Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Channel Pie */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
            <TopItemsChart
              data={(data?.by_channel ?? []).map((c: any) => ({ name: c.name, value: c.revenue }))}
              title="Revenue By Channel"
              type="pie"
            />
          </div>

          {/* Top Products */}
          <div className="lg:col-span-2">
            <Section title="Top Products" tooltip={{ title: 'Top Products', formula: 'Revenue, qty & ASP grouped by\nproduct_template\nFROM sale.order.line WHERE order confirmed', source: 'sale.order.line → product.template' }}>
              <DataTable data={data?.by_product ?? []} columns={productCols} isLoading={isLoading} />
            </Section>
          </div>
        </div>

        {/* Tables: Top Channels + Top Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Top Channels" tooltip={{ title: 'Top Channels', formula: 'Orders, revenue, qty & ASP grouped by\nsales team (crm.team)\nFROM sale.order WHERE confirmed', source: 'sale.order → crm.team' }}>
            <DataTable data={data?.by_channel ?? []} columns={channelCols} isLoading={isLoading} />
          </Section>
          <Section title="Top Categories" tooltip={{ title: 'Top Categories', formula: 'Orders, revenue, qty & ASP grouped by\nproduct.category\nFROM sale.order.line WHERE order confirmed', source: 'sale.order.line → product.category' }}>
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
