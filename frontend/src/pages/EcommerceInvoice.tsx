import { useState, useMemo } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import {
  DollarSign, TrendingUp, Package, Tag, Gauge, ShieldCheck,
} from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { CalcTooltip } from '@/components/ui/CalcTooltip'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import { PermissionGate } from '@/components/ui/PermissionGate'
import {
  useEcommerceInvoiceOverview,
  useEcommerceFilterOptions,
} from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import ReactECharts from 'echarts-for-react'
import { useTheme } from '@/hooks/useTheme'
import type { ColumnDef } from '@tanstack/react-table'

export default function EcommerceInvoice() {
  const { dateFrom, dateTo, setDateFrom, setDateTo, setDateRange } = useDateFilterState('ecom-invoice')
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Multi-select filter state
  const [channelIds, setChannelIds] = useState<number[]>([])
  const [categoryIds, setCategoryIds] = useState<number[]>([])

  const params = {
    date_from: dateFrom,
    date_to: dateTo,
    channel_ids: channelIds.length ? channelIds : undefined,
    category_ids: categoryIds.length ? categoryIds : undefined,
  }

  const { data, isLoading } = useEcommerceInvoiceOverview(params)
  const { data: filterOpts } = useEcommerceFilterOptions()

  const kpis = data?.kpis

  // Chart theming
  const textColor = isDark ? '#e2e8f0' : '#1a1f3d'
  const subColor = isDark ? '#94a3b8' : '#64748b'
  const gridColor = isDark ? '#2a305540' : '#e8edf280'
  const tooltipBg = isDark ? '#131829' : '#ffffff'
  const tooltipBorder = isDark ? '#2a3055' : '#e8edf2'

  // Weekly invoiced line chart
  const weeklyOption = useMemo(() => {
    if (!data?.weekly_invoiced?.length) return null
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderRadius: 8,
        textStyle: { color: textColor, fontFamily: 'Oswald', fontSize: 13 },
      },
      grid: { left: 60, right: 20, top: 30, bottom: 40 },
      xAxis: {
        type: 'category',
        data: data.weekly_invoiced.map((d: any) => d.week),
        axisLabel: { color: subColor, fontSize: 10 },
        axisLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: subColor, formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [{
        name: 'Invoiced',
        type: 'line',
        data: data.weekly_invoiced.map((d: any) => d.revenue),
        smooth: true,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.15 },
        itemStyle: { color: '#48cae1' },
      }],
    }
  }, [data?.weekly_invoiced, isDark])

  // Table columns
  const channelCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Channel' },
    { accessorKey: 'qty', header: 'Quantity', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'asp', header: 'ASP', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const categoryCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Category' },
    { accessorKey: 'qty', header: 'Quantity', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'margin', header: 'Margin', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'margin_pct', header: 'Margin %', cell: ({ getValue }) => `${(getValue() as number).toFixed(1)}%` },
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
    <PermissionGate resource="ecommerce.invoice_view">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-heading font-bold text-[var(--foreground)]">E-Commerce (Invoice Data)</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Invoice-based e-commerce dashboard — P&L revenue, margins & channel performance</p>
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

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard title="P&L Invoiced Revenue" value={kpis ? formatCurrency(kpis.invoiced_revenue) : undefined} icon={DollarSign} accent="#48cae1" loading={isLoading}
            subtitle={kpis ? `${kpis.revenue_change_pct >= 0 ? '↑' : '↓'}${Math.abs(kpis.revenue_change_pct).toFixed(2)}%` : undefined}
            subtitleColor={kpis?.revenue_change_pct >= 0 ? '#22c55e' : '#ef4444'}
            tooltip={{ title: 'P&L Invoiced Revenue', formula: 'SUM(amount_untaxed) for out_invoice\n- SUM(amount_untaxed) for out_refund\nWHERE state = posted, date in range', source: 'account.move' }} />
          <KpiCard title="Inv Revenue Margin" value={kpis ? `${kpis.inv_revenue_margin_pct}%` : undefined} icon={TrendingUp} accent="#22c55e" loading={isLoading}
            tooltip={{ title: 'Invoice Revenue Margin', formula: 'Device Margin / P&L Invoiced Revenue × 100\nExcludes: Accessories, Deliveries, Headphones', source: 'sale.order.line → product.category' }} />
          <KpiCard title="Units Sold" value={kpis ? formatNumber(kpis.units_sold) : undefined} icon={Package} accent="#a855f7" loading={isLoading}
            tooltip={{ title: 'Units Sold', formula: 'SUM(qty_invoiced) from sale.order.line\nWHERE order is invoiced\nExcludes non-device categories', source: 'sale.order.line' }} />
          <KpiCard title="ASP" value={kpis ? formatCurrency(kpis.asp) : undefined} icon={Tag} accent="#f97316" loading={isLoading}
            tooltip={{ title: 'Average Selling Price', formula: 'P&L Invoiced Revenue / Units Sold' }} />
          <KpiCard title="Revenue Pace" value={kpis ? formatCurrency(kpis.revenue_pace) : undefined} icon={Gauge} accent="#06b6d4" loading={isLoading}
            tooltip={{ title: 'Revenue Pace', formula: 'Current revenue / days elapsed × days in month\nProjects current period to full month' }} />
          <KpiCard title="Invoiced Revenue (w/o RMA)" value={kpis ? formatCurrency(kpis.revenue_no_rma) : undefined} icon={ShieldCheck} accent="#8b5cf6" loading={isLoading}
            subtitle={kpis ? `${kpis.rev_no_rma_change_pct >= 0 ? '↑' : '↓'}${Math.abs(kpis.rev_no_rma_change_pct).toFixed(2)}%` : undefined}
            subtitleColor={kpis?.rev_no_rma_change_pct >= 0 ? '#22c55e' : '#ef4444'}
            tooltip={{ title: 'Invoiced Revenue (w/o RMA)', formula: 'SUM(amount_untaxed) for out_invoice ONLY\nExcludes all refunds/credit notes', source: 'account.move (out_invoice only)' }} />
        </div>

        {/* Charts row: Pie + Weekly + Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Channel Pie */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
            <TopItemsChart
              data={(data?.by_channel ?? []).map((c: any) => ({ name: c.name, value: c.revenue }))}
              title="Revenue By Channel"
              type="pie"
            />
          </div>

          {/* Weekly Invoiced Line */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
            <h3 className="text-sm font-heading font-bold text-[var(--foreground)] mb-2 flex items-center gap-2">
              Weekly Invoices
              <CalcTooltip title="Weekly Invoices" formula="SUM(amount_untaxed) grouped by week\nFROM account.move WHERE posted out_invoice" source="account.move" />
            </h3>
            {weeklyOption ? (
              <ReactECharts option={weeklyOption} style={{ height: 260 }} />
            ) : (
              <div className="h-[260px] flex items-center justify-center text-[var(--muted-foreground)] text-sm">
                {isLoading ? 'Loading…' : 'No data'}
              </div>
            )}
          </div>

          {/* Comparison Stats */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
            <h3 className="text-sm font-heading font-bold text-[var(--foreground)] mb-3 text-center"
                style={{ background: 'linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Comparison Stats
            </h3>
            {data?.comparison_stats?.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left py-2 text-[var(--muted-foreground)] font-medium"></th>
                    {data.comparison_stats.map((m: any) => (
                      <th key={m.month} className="text-right py-2 text-[var(--muted-foreground)] font-medium">{m.month}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--border)]/50">
                    <td className="py-2 text-[var(--foreground)] font-medium">Revenue</td>
                    {data.comparison_stats.map((m: any) => (
                      <td key={m.month} className="text-right py-2 text-[var(--foreground)]">{formatCurrency(m.revenue)}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-[var(--border)]/50">
                    <td className="py-2 text-[var(--foreground)] font-medium">Device Margin</td>
                    {data.comparison_stats.map((m: any) => (
                      <td key={m.month} className="text-right py-2 text-[var(--foreground)]">{formatCurrency(m.device_margin)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 text-[var(--foreground)] font-medium">Device Margin %</td>
                    {data.comparison_stats.map((m: any) => (
                      <td key={m.month} className="text-right py-2 text-[var(--foreground)]">{m.device_margin_pct}%</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-[var(--muted-foreground)] text-sm">
                {isLoading ? 'Loading…' : 'No data'}
              </div>
            )}
          </div>
        </div>

        {/* Tables: Top Channels + Top Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Top Channels" tooltip={{ title: 'Top Channels', formula: 'Revenue, qty & ASP grouped by\nsales team (crm.team)\nFROM invoiced sale.order.line', source: 'sale.order.line → crm.team' }}>
            <DataTable data={data?.by_channel ?? []} columns={channelCols} isLoading={isLoading} />
          </Section>
          <Section title="Top Categories" tooltip={{ title: 'Top Categories', formula: 'Revenue, qty, margin & margin%\ngrouped by product.category\nFROM invoiced sale.order.line', source: 'sale.order.line → product.category' }}>
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
