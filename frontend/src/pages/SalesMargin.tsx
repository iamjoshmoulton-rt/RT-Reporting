import { useDateFilterState } from '@/hooks/useDateFilterState'
import { CalcTooltip } from '@/components/ui/CalcTooltip'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { DataTable } from '@/components/tables/DataTable'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { useSalesMarginOverview } from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'

export default function SalesMargin() {
  const { dateFrom, dateTo, setDateFrom, setDateTo, setDateRange } = useDateFilterState('sales-margin')

  const params = {
    date_from: dateFrom,
    date_to: dateTo,
  }

  const { data, isLoading } = useSalesMarginOverview(params)

  const kpis = data?.kpis

  // KPI card definitions
  const kpiCards = [
    {
      label: 'Invoiced Revenue',
      value: kpis ? formatCurrency(kpis.invoiced_revenue) : '—',
      tooltip: { title: 'Invoiced Revenue', formula: 'SUM(amount_untaxed)\nFROM account_move\nWHERE move_type = out_invoice\nAND state = posted', source: 'account_move' },
    },
    {
      label: 'Invoiced Margin',
      value: kpis ? formatCurrency(kpis.invoiced_margin) : '—',
      tooltip: { title: 'Invoiced Margin', formula: 'Revenue - Cost\nIncome from product lines (negative balance)\nminus cost lines (positive balance)\nFROM account_move_line\nWHERE product_id IS NOT NULL', source: 'account_move_line' },
    },
    {
      label: 'Margin %',
      value: kpis ? `${kpis.margin_pct}%` : '—',
      tooltip: { title: 'Margin %', formula: '(Invoiced Margin / Invoiced Revenue) × 100', source: 'Derived' },
    },
    {
      label: 'Return Revenue',
      value: kpis ? formatCurrency(kpis.return_revenue) : '—',
      negative: true,
      tooltip: { title: 'Return Revenue', formula: '-SUM(amount_untaxed)\nFROM account_move\nWHERE move_type = out_refund\nAND state = posted', source: 'account_move' },
    },
    {
      label: 'Return Margin',
      value: kpis ? formatCurrency(kpis.return_margin) : '—',
      negative: true,
      tooltip: { title: 'Return Margin', formula: '-(Income - Cost) from refund product lines\nFROM account_move_line\nWHERE move_type = out_refund', source: 'account_move_line' },
    },
  ]

  // Salesperson table columns
  const salespersonCols: ColumnDef<any, any>[] = [
    { accessorKey: 'sales_person', header: 'Sales Person' },
    { accessorKey: 'total_revenue', header: 'Total Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'total_margin', header: 'Total Margin', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'margin_pct', header: 'Margin %', cell: ({ getValue }) => `${getValue()}%` },
    { accessorKey: 'returned_sales', header: 'Returned Sales', cell: ({ getValue }) => (
      <span className="text-red-400">{formatCurrency(getValue() as number)}</span>
    ) },
    { accessorKey: 'returned_margin', header: 'Returned Margin', cell: ({ getValue }) => (
      <span className="text-red-400">{formatCurrency(getValue() as number)}</span>
    ) },
  ]

  // Transaction list columns
  const transactionCols: ColumnDef<any, any>[] = [
    {
      accessorKey: 'number',
      header: 'Number',
      cell: ({ row }) => {
        const isRefund = row.original.is_refund
        return (
          <span className={cn(isRefund && 'text-red-400 font-medium')}>
            {row.original.number}
          </span>
        )
      },
    },
    { accessorKey: 'date', header: 'Date' },
    { accessorKey: 'sales_person', header: 'Sales Person' },
    { accessorKey: 'partner', header: 'Partner' },
    {
      accessorKey: 'revenue',
      header: 'Revenue',
      cell: ({ row }) => {
        const isRefund = row.original.is_refund
        return (
          <span className={cn(isRefund && 'text-red-400')}>
            {formatCurrency(row.original.revenue)}
          </span>
        )
      },
    },
    {
      accessorKey: 'margin',
      header: 'Margin',
      cell: ({ row }) => {
        const isRefund = row.original.is_refund
        return (
          <span className={cn(isRefund && 'text-red-400')}>
            {formatCurrency(row.original.margin)}
          </span>
        )
      },
    },
    {
      accessorKey: 'margin_pct',
      header: 'Margin %',
      cell: ({ row }) => {
        const isRefund = row.original.is_refund
        return (
          <span className={cn(isRefund && 'text-red-400')}>
            {row.original.margin_pct}%
          </span>
        )
      },
    },
  ]

  return (
    <PermissionGate resource="sales_margin.view">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-heading font-bold text-[var(--foreground)]">Sales Margin Dashboard</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Invoice-based margin analysis — revenue, margin & returns by salesperson</p>
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
              <div className={cn(
                "text-xl font-heading font-bold",
                kpi.negative ? "text-red-400" : "text-[var(--foreground)]"
              )}>
                {isLoading ? (
                  <div className="h-7 w-24 bg-[var(--muted)] animate-pulse rounded" />
                ) : (
                  kpi.value
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Margin By Salesperson */}
        <Section
          title="Margin By Salesperson"
          tooltip={{
            title: 'Margin By Salesperson',
            formula: 'Revenue, margin, margin% grouped by\nsalesperson (invoice_user_id → res.users → res.partner)\nFROM account_move + account_move_line\nWHERE state = posted',
            source: 'account_move → res.users → res.partner',
          }}
        >
          <DataTable data={data?.by_salesperson ?? []} columns={salespersonCols} isLoading={isLoading} />
        </Section>

        {/* Transaction List */}
        <Section
          title="Transaction List"
          tooltip={{
            title: 'Transaction List',
            formula: 'Individual invoices (INV) and\ncredit notes (RINV) with revenue,\nmargin & margin% per document\nFROM account_move\nWHERE state = posted\nSorted by date desc, max 500 rows',
            source: 'account_move + account_move_line',
          }}
        >
          <DataTable data={data?.transactions ?? []} columns={transactionCols} isLoading={isLoading} />
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
