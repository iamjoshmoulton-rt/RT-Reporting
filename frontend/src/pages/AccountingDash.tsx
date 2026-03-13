import { useDateFilterState } from '@/hooks/useDateFilterState'
import { CalcTooltip } from '@/components/ui/CalcTooltip'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { useAccountingDashOverview } from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'

export default function AccountingDash() {
  const { dateFrom, dateTo, setDateFrom, setDateTo, setDateRange } = useDateFilterState('accounting-dash')

  const params = {
    date_from: dateFrom,
    date_to: dateTo,
  }

  const { data, isLoading } = useAccountingDashOverview(params)

  const kpis = data?.kpis

  // KPI card definitions
  const kpiCards = [
    {
      label: 'Net Revenue',
      value: kpis ? formatCurrency(kpis.net_revenue) : '—',
      sub: 'Net revenue as reported on the P&L',
      tooltip: { title: 'Net Revenue', formula: '-SUM(balance)\nFROM account_move_line\nJOIN account_account\nWHERE account_type IN (income, income_other)\nAND parent_state = posted', source: 'account_move_line → account_account' },
    },
    {
      label: 'Device Margin',
      value: kpis ? formatCurrency(kpis.device_margin) : '—',
      sub: 'P&L revenue minus device COGS',
      tooltip: { title: 'Device Margin', formula: 'Net Revenue - Device COGS\nCOGS = SUM(balance) WHERE\naccount_type = expense_direct_cost', source: 'account_move_line → account_account' },
    },
    {
      label: 'Device Margin %',
      value: kpis ? `${kpis.margin_pct}%` : '—',
      tooltip: { title: 'Device Margin %', formula: '(Device Margin / Net Revenue) × 100', source: 'Derived' },
    },
    {
      label: 'Variable COGS',
      value: kpis ? formatCurrency(kpis.variable_cogs) : '—',
      tooltip: { title: 'Variable COGS', formula: 'SUM(balance)\nFROM account_move_line\nJOIN account_account\nWHERE account_type = expense\nAND parent_state = posted', source: 'account_move_line → account_account' },
    },
    {
      label: 'Raw Inventory',
      value: kpis ? formatCurrency(kpis.raw_inventory) : '—',
      sub: 'Combined PO value for non-processing POs',
      tooltip: { title: 'Raw Inventory', formula: 'SUM(price_subtotal)\nFROM purchase_order_line\nJOIN purchase_order\nWHERE state IN (draft, sent, to approve)', source: 'purchase.order.line' },
    },
  ]

  // Revenue trend chart data
  const revenueTrendData = useMemo(() =>
    (data?.revenue_trend ?? []).map((d: any) => ({
      name: d.month,
      value: d.revenue,
    })),
    [data?.revenue_trend]
  )

  // Channel chart data — grouped bar (revenue + margin)
  const channelChartData = useMemo(() =>
    (data?.stats_by_channel ?? []).map((d: any) => ({
      name: d.channel,
      value: d.revenue,
    })),
    [data?.stats_by_channel]
  )

  const channelMarginData = useMemo(() =>
    (data?.stats_by_channel ?? []).map((d: any) => ({
      name: d.channel,
      value: d.device_margin,
    })),
    [data?.stats_by_channel]
  )

  // Stats By Channel columns
  const channelCols: ColumnDef<any, any>[] = [
    { accessorKey: 'channel', header: 'Channel' },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'device_margin', header: 'Device Margin', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'margin_pct', header: 'Margin %', cell: ({ getValue }) => `${getValue()}%` },
  ]

  // Rev Share columns
  const revShareCols: ColumnDef<any, any>[] = [
    { accessorKey: 'vendor', header: 'Vendor' },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'units_sold', header: 'Units Sold', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'avg_sale_price', header: 'Avg Sale Price', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  return (
    <PermissionGate resource="accounting_dash.view">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-heading font-bold text-[var(--foreground)]">Accounting Dashboard</h1>
          <p className="text-sm text-[var(--muted-foreground)]">P&L-based analysis — net revenue, device margin, COGS & channel breakdowns</p>
        </div>

        {/* Date Range */}
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onDateRangeChange={setDateRange}
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpiCards.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4"
            >
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs font-medium text-[var(--muted-foreground)]">{kpi.label}</span>
                {kpi.tooltip && <CalcTooltip {...kpi.tooltip} />}
              </div>
              <div className="text-xl font-heading font-bold text-[var(--foreground)]">
                {isLoading ? (
                  <div className="h-7 w-24 bg-[var(--muted)] animate-pulse rounded" />
                ) : (
                  kpi.value
                )}
              </div>
              {kpi.sub && (
                <p className="text-[10px] text-[var(--muted-foreground)] mt-1">{kpi.sub}</p>
              )}
            </div>
          ))}
        </div>

        {/* Charts Row — Invoiced Revenue + Revenue & Margin By Channel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
            <TopItemsChart
              data={revenueTrendData}
              title="Invoiced Revenue"
              type="bar"
            />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
            <h3 className="text-sm font-heading font-bold text-[var(--foreground)] mb-3">Revenue & Margin By Channel</h3>
            <div className="grid grid-cols-2 gap-4">
              <TopItemsChart
                data={channelChartData}
                title="Revenue"
                type="bar"
              />
              <TopItemsChart
                data={channelMarginData}
                title="Device Margin"
                type="bar"
              />
            </div>
          </div>
        </div>

        {/* Rev Share + Stats By Channel side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section
            title="Rev Share"
            tooltip={{
              title: 'Rev Share',
              formula: 'Revenue, units sold & avg sale price\ngrouped by customer (res.partner)\nFROM account_move\nWHERE state = posted\nAND move_type IN (out_invoice, out_refund)\nTop 100 by revenue',
              source: 'account_move → res.partner',
            }}
          >
            <DataTable data={data?.rev_share ?? []} columns={revShareCols} isLoading={isLoading} />
          </Section>

          <Section
            title="Stats By Channel"
            tooltip={{
              title: 'Stats By Channel',
              formula: 'Revenue, device margin & margin%\nper sales team (crm.team)\nFROM account_move_line\nJOIN account_move → sale_order → crm_team\nIncome & COGS accounts, posted entries',
              source: 'account_move_line → crm.team',
            }}
          >
            <DataTable data={data?.stats_by_channel ?? []} columns={channelCols} isLoading={isLoading} />
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
