import { useState, useMemo } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import {
  DollarSign, TrendingUp, Package, BarChart3, Target,
  CalendarClock, Maximize2, Tag,
} from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { CalcTooltip } from '@/components/ui/CalcTooltip'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import { PermissionGate } from '@/components/ui/PermissionGate'
import {
  useSalesDashboardOverview,
  useSalesDashboardFilterOptions,
} from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import ReactECharts from 'echarts-for-react'
import { useTheme } from '@/hooks/useTheme'
import type { ColumnDef } from '@tanstack/react-table'

export default function SalesDashboard() {
  const { dateFrom, dateTo, setDateFrom, setDateTo } = useDateFilterState('sales-dashboard')
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Filters
  const [salespersonId, setSalespersonId] = useState<number | undefined>()
  const [customerId, setCustomerId] = useState<number | undefined>()
  const [channelId, setChannelId] = useState<number | undefined>()
  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [countryId, setCountryId] = useState<number | undefined>()

  const params = {
    date_from: dateFrom,
    date_to: dateTo,
    salesperson_id: salespersonId,
    customer_id: customerId,
    channel_id: channelId,
    category_id: categoryId,
    country_id: countryId,
  }

  const { data, isLoading } = useSalesDashboardOverview(params)
  const { data: filterOpts } = useSalesDashboardFilterOptions()

  const kpis = data?.kpis
  const selectCls = 'rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] px-3 py-1.5 text-sm focus:outline-none focus:border-primary'

  // Chart colors
  const textColor = isDark ? '#e2e8f0' : '#1a1f3d'
  const subColor = isDark ? '#94a3b8' : '#64748b'
  const gridColor = isDark ? '#2a305540' : '#e8edf280'
  const tooltipBg = isDark ? '#131829' : '#ffffff'
  const tooltipBorder = isDark ? '#2a3055' : '#e8edf2'

  // Monthly sales bar chart
  const monthlyOption = useMemo(() => {
    if (!data?.monthly_sales?.length) return null
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderRadius: 8,
        textStyle: { color: textColor, fontFamily: 'Oswald', fontSize: 13 },
      },
      grid: { left: 60, right: 20, top: 40, bottom: 40 },
      xAxis: {
        type: 'category',
        data: data.monthly_sales.map((d: any) => d.month),
        axisLabel: { color: subColor },
        axisLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: subColor, formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: 'Revenue',
          type: 'bar',
          data: data.monthly_sales.map((d: any) => d.revenue),
          itemStyle: { color: '#48cae1', borderRadius: [4, 4, 0, 0] },
        },
        {
          name: 'Margin',
          type: 'bar',
          data: data.monthly_sales.map((d: any) => d.margin),
          itemStyle: { color: '#22c55e', borderRadius: [4, 4, 0, 0] },
        },
      ],
    }
  }, [data?.monthly_sales, isDark])

  // Weekly line charts
  const weeklyOption = (series: any[], label: string) => {
    if (!series?.length) return null
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
        data: series.map((d: any) => d.week),
        axisLabel: { color: subColor, fontSize: 10 },
        axisLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: subColor, formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [{
        name: label,
        type: 'line',
        data: series.map((d: any) => d.revenue),
        smooth: true,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.15 },
        itemStyle: { color: label === 'Invoiced' ? '#48cae1' : '#f97316' },
      }],
    }
  }

  // Table column helpers
  const nameRevCols = (nameLabel: string): ColumnDef<any, any>[] => [
    { accessorKey: 'name', header: nameLabel },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'margin', header: 'Margin', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'orders', header: 'Orders', cell: ({ getValue }) => formatNumber(getValue() as number) },
  ]

  const invoiceCols: ColumnDef<any, any>[] = [
    { accessorKey: 'invoice_number', header: 'Invoice' },
    { accessorKey: 'customer', header: 'Customer' },
    { accessorKey: 'salesperson', header: 'Salesperson' },
    { accessorKey: 'date', header: 'Date' },
    { accessorKey: 'amount', header: 'Amount', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'payment_state', header: 'Payment' },
  ]

  const countryCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Country' },
    { accessorKey: 'code', header: 'Code' },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'orders', header: 'Orders' },
  ]

  const categoryCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Category' },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'margin', header: 'Margin', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'qty', header: 'Qty', cell: ({ getValue }) => formatNumber(getValue() as number) },
  ]

  const productCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Product' },
    { accessorKey: 'sku', header: 'SKU', cell: ({ getValue }) => <span className="text-primary">{(getValue() as string) || '-'}</span> },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'margin', header: 'Margin', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'qty', header: 'Qty', cell: ({ getValue }) => formatNumber(getValue() as number) },
  ]

  const openOrderCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Salesperson' },
    { accessorKey: 'orders', header: 'Orders' },
    { accessorKey: 'amount', header: 'Amount', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const marginCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Channel' },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'margin', header: 'Margin', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'margin_percent', header: 'Margin %', cell: ({ getValue }) => `${(getValue() as number).toFixed(1)}%` },
  ]

  return (
    <PermissionGate resource="sales.revenue_chart">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-heading font-bold text-[var(--foreground)]">Sales Dashboard</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Replicated Odoo Sales Spreadsheet — KPIs, charts & tables</p>
        </div>

        {/* Date Range */}
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <select value={salespersonId ?? ''} onChange={e => setSalespersonId(e.target.value ? +e.target.value : undefined)} className={selectCls}>
            <option value="">All Salespersons</option>
            {filterOpts?.salespersons?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={channelId ?? ''} onChange={e => setChannelId(e.target.value ? +e.target.value : undefined)} className={selectCls}>
            <option value="">All Channels</option>
            {filterOpts?.channels?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={categoryId ?? ''} onChange={e => setCategoryId(e.target.value ? +e.target.value : undefined)} className={selectCls}>
            <option value="">All Categories</option>
            {filterOpts?.categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={countryId ?? ''} onChange={e => setCountryId(e.target.value ? +e.target.value : undefined)} className={selectCls}>
            <option value="">All Countries</option>
            {filterOpts?.countries?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Invoiced Revenue" value={kpis ? formatCurrency(kpis.invoiced_revenue) : undefined} icon={DollarSign} accent="#48cae1" loading={isLoading}
            tooltip={{ title: 'Invoiced Revenue', formula: 'SUM(price_subtotal)\nFROM account.move.line\nWHERE move_type = out_invoice\n  AND state = posted\n  AND date in selected range', source: 'account.move.line' }} />
          <KpiCard title="Invoiced Margin" value={kpis ? formatCurrency(kpis.invoiced_margin) : undefined} icon={TrendingUp} accent="#22c55e" loading={isLoading}
            tooltip={{ title: 'Invoiced Margin', formula: 'SUM(price_subtotal - (quantity × product standard_price))\nFROM posted out_invoice lines', source: 'account.move.line + product.product' }} />
          <KpiCard title="Margin %" value={kpis ? `${kpis.margin_percent.toFixed(1)}%` : undefined} icon={BarChart3} accent="#f97316" loading={isLoading}
            tooltip={{ title: 'Margin %', formula: '(Invoiced Margin / Invoiced Revenue) × 100\nDerived from posted invoice lines' }} />
          <KpiCard title="Units Sold" value={kpis ? formatNumber(kpis.units_sold) : undefined} icon={Package} accent="#a855f7" loading={isLoading}
            tooltip={{ title: 'Units Sold', formula: 'SUM(quantity)\nFROM account.move.line\nWHERE move_type = out_invoice\n  AND state = posted', source: 'account.move.line' }} />
          <KpiCard title="Open Pipeline" value={kpis ? formatCurrency(kpis.open_pipeline) : undefined} icon={Target} accent="#ef4444" loading={isLoading}
            tooltip={{ title: 'Open Pipeline', formula: 'SUM(order_line.price_subtotal)\nFROM sale.order\nWHERE state = sale\n  AND invoice_status ≠ invoiced', source: 'sale.order.line' }} />
          <KpiCard title="Open Pipeline (Date)" value={kpis ? formatCurrency(kpis.open_pipeline_date) : undefined} icon={CalendarClock} accent="#eab308" loading={isLoading}
            tooltip={{ title: 'Open Pipeline (Date)', formula: 'Same as Open Pipeline,\nfiltered to orders confirmed\nwithin selected date range', source: 'sale.order.line' }} />
          <KpiCard title="Max Potential Revenue" value={kpis ? formatCurrency(kpis.max_potential_revenue) : undefined} icon={Maximize2} accent="#06b6d4" loading={isLoading}
            tooltip={{ title: 'Max Potential Revenue', formula: 'SUM(price_subtotal)\nFROM sale.order.line\nWHERE order state in (sale, done)\n  AND date_order in selected range', source: 'sale.order.line' }} />
          <KpiCard title="Avg Sell Price" value={kpis ? formatCurrency(kpis.avg_sell_price) : undefined} icon={Tag} accent="#8b5cf6" loading={isLoading}
            tooltip={{ title: 'Avg Sell Price', formula: 'Invoiced Revenue / Units Sold\nDerived from posted invoice lines' }} />
        </div>

        {/* Monthly Sales + Salespersons + Channel charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
            <h3 className="text-sm font-heading font-bold text-[var(--foreground)] mb-2 flex items-center gap-2">Monthly Sales <CalcTooltip title="Monthly Sales" formula="Revenue & Margin grouped by month\nFROM account.move.line\nWHERE move_type = out_invoice AND state = posted" source="account.move.line" /></h3>
            {monthlyOption ? (
              <ReactECharts option={monthlyOption} style={{ height: 260 }} />
            ) : (
              <div className="h-[260px] flex items-center justify-center text-[var(--muted-foreground)] text-sm">
                {isLoading ? 'Loading…' : 'No data'}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
            <TopItemsChart
              data={(data?.by_salesperson ?? []).slice(0, 8).map((s: any) => ({ name: s.name, value: s.revenue }))}
              title="Top Salespersons"
              type="bar"
            />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
            <TopItemsChart
              data={(data?.by_channel ?? []).map((c: any) => ({ name: c.name, value: c.revenue }))}
              title="Sales By Channel"
              type="pie"
            />
          </div>
        </div>

        {/* Top Customers + Top Invoices */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Top Customers" tooltip={{ title: 'Top Customers', formula: 'Revenue, margin & order count\ngrouped by customer (res.partner)\nFROM posted out_invoice lines\nORDERED BY revenue DESC, LIMIT 20', source: 'account.move.line → res.partner' }}>
            <DataTable data={data?.top_customers ?? []} columns={nameRevCols('Customer')} isLoading={isLoading} />
          </Section>
          <Section title="Top Invoices" tooltip={{ title: 'Top Invoices', formula: 'Individual posted invoices\nORDERED BY amount_total DESC\nShows invoice #, customer, salesperson,\ndate, amount & payment state', source: 'account.move' }}>
            <DataTable data={data?.top_invoices ?? []} columns={invoiceCols} isLoading={isLoading} />
          </Section>
        </div>

        {/* Countries + Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Top Countries" tooltip={{ title: 'Top Countries', formula: 'Revenue & order count grouped by\ncustomer country (res.country)\nFROM posted out_invoice lines', source: 'account.move.line → res.partner → res.country' }}>
            <DataTable data={data?.by_country ?? []} columns={countryCols} isLoading={isLoading} />
          </Section>
          <Section title="Top Categories" tooltip={{ title: 'Top Categories', formula: 'Revenue, margin & qty grouped by\nproduct category (product.category)\nFROM posted out_invoice lines', source: 'account.move.line → product.category' }}>
            <DataTable data={data?.by_category ?? []} columns={categoryCols} isLoading={isLoading} />
          </Section>
        </div>

        {/* Salespersons table + Channel table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Sales By Salesperson" tooltip={{ title: 'Sales By Salesperson', formula: 'Revenue, margin & order count\ngrouped by salesperson (res.users)\nFROM posted out_invoice lines', source: 'account.move.line → res.users' }}>
            <DataTable data={data?.by_salesperson ?? []} columns={nameRevCols('Salesperson')} isLoading={isLoading} />
          </Section>
          <Section title="Sales By Channel" tooltip={{ title: 'Sales By Channel', formula: 'Revenue, margin & order count\ngrouped by sales team (crm.team)\nFROM posted out_invoice lines', source: 'account.move.line → crm.team' }}>
            <DataTable data={data?.by_channel ?? []} columns={nameRevCols('Channel')} isLoading={isLoading} />
          </Section>
        </div>

        {/* Open Orders by Rep + Top Products */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Open Orders by Rep" tooltip={{ title: 'Open Orders by Rep', formula: 'Order count & SUM(amount_total)\nFROM sale.order\nWHERE state = sale\n  AND invoice_status ≠ invoiced\nGROUPED BY salesperson', source: 'sale.order → res.users' }}>
            <DataTable data={data?.open_orders_by_rep ?? []} columns={openOrderCols} isLoading={isLoading} />
          </Section>
          <Section title="Top Products" tooltip={{ title: 'Top Products', formula: 'Revenue, margin & qty grouped by\nproduct (product.product)\nFROM posted out_invoice lines\nORDERED BY revenue DESC, LIMIT 30', source: 'account.move.line → product.product' }}>
            <DataTable data={data?.top_products ?? []} columns={productCols} isLoading={isLoading} />
          </Section>
        </div>

        {/* Invoiced By Week + Booked By Week line charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
            <h3 className="text-sm font-heading font-bold text-[var(--foreground)] mb-2 flex items-center gap-2">Invoiced By Week <CalcTooltip title="Invoiced By Week" formula="SUM(price_subtotal) grouped by\nISO week of invoice date\nFROM posted out_invoice lines" source="account.move.line" /></h3>
            {data?.invoiced_by_week?.length ? (
              <ReactECharts option={weeklyOption(data.invoiced_by_week, 'Invoiced')!} style={{ height: 240 }} />
            ) : (
              <div className="h-[240px] flex items-center justify-center text-[var(--muted-foreground)] text-sm">
                {isLoading ? 'Loading…' : 'No data'}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
            <h3 className="text-sm font-heading font-bold text-[var(--foreground)] mb-2 flex items-center gap-2">Booked By Week <CalcTooltip title="Booked By Week" formula="SUM(price_subtotal) grouped by\nISO week of order confirmation date\nFROM sale.order.line\nWHERE order state in (sale, done)" source="sale.order.line" /></h3>
            {data?.booked_by_week?.length ? (
              <ReactECharts option={weeklyOption(data.booked_by_week, 'Booked')!} style={{ height: 240 }} />
            ) : (
              <div className="h-[240px] flex items-center justify-center text-[var(--muted-foreground)] text-sm">
                {isLoading ? 'Loading…' : 'No data'}
              </div>
            )}
          </div>
        </div>

        {/* Margin By Channel */}
        <Section title="Device Margin By Channel" tooltip={{ title: 'Device Margin By Channel', formula: 'Revenue, margin & margin% grouped by\nsales team (crm.team)\nMargin = revenue - (qty × standard_price)\nMargin% = margin / revenue × 100', source: 'account.move.line → crm.team' }}>
          <DataTable data={data?.margin_by_channel ?? []} columns={marginCols} isLoading={isLoading} />
        </Section>
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
