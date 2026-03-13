import { useDateFilterState } from '@/hooks/useDateFilterState'
import { CalcTooltip } from '@/components/ui/CalcTooltip'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { DataTable } from '@/components/tables/DataTable'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { useTradeInOverview } from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'

export default function TradeIn() {
  const { dateFrom, dateTo, setDateFrom, setDateTo, setDateRange } = useDateFilterState('trade-in')

  const params = {
    date_from: dateFrom,
    date_to: dateTo,
  }

  const { data, isLoading } = useTradeInOverview(params)

  const kpis = data?.kpis

  // KPI card definitions
  const kpiCards = [
    {
      label: 'Landed Units',
      value: kpis ? formatNumber(kpis.landed_units) : '—',
      tooltip: { title: 'Landed Units', formula: 'SUM(qty_received)\nFROM purchase_order_line\nJOIN purchase_order WHERE state in (purchase, done)', source: 'purchase.order.line' },
    },
    {
      label: 'Incoming Units',
      value: kpis ? formatNumber(kpis.incoming_units) : '—',
      tooltip: { title: 'Incoming Units', formula: 'SUM(product_qty - qty_received)\nFROM purchase_order_line\nJOIN purchase_order WHERE state in (purchase, done)\nUnits ordered but not yet received', source: 'purchase.order.line' },
    },
  ]

  // Top Vendors columns
  const vendorCols: ColumnDef<any, any>[] = [
    { accessorKey: 'partner', header: 'Partner' },
    { accessorKey: 'qty_ordered', header: 'Qty Ordered', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'qty_received', header: 'Qty Received', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total', header: 'Total', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  // Top Categories columns
  const categoryCols: ColumnDef<any, any>[] = [
    { accessorKey: 'category', header: 'Category' },
    { accessorKey: 'qty_received', header: 'Qty Received', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'qty_ordered', header: 'Qty Ordered', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total', header: 'Total', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  // Incoming By Vendor columns
  const incomingCols: ColumnDef<any, any>[] = [
    { accessorKey: 'partner', header: 'Partner' },
    { accessorKey: 'order_count', header: 'Order Count', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'qty_ordered', header: 'Qty Ordered', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total', header: 'Total', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  return (
    <PermissionGate resource="trade_in.view">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-heading font-bold text-[var(--foreground)]">Trade-In</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Purchase order based trade-in analysis — landed units, incoming units, vendors & categories</p>
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
        <div className="grid grid-cols-2 gap-3 max-w-md">
          {kpiCards.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4"
            >
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs font-medium text-[var(--muted-foreground)]">{kpi.label}</span>
                {kpi.tooltip && <CalcTooltip {...kpi.tooltip} />}
              </div>
              <div className="text-2xl font-heading font-bold text-[var(--foreground)]">
                {isLoading ? (
                  <div className="h-8 w-24 bg-[var(--muted)] animate-pulse rounded" />
                ) : (
                  kpi.value
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Top Vendors + Top Categories side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section
            title="Top Vendors"
            tooltip={{
              title: 'Top Vendors',
              formula: 'Qty ordered, qty received & total value\ngrouped by vendor (res.partner)\nFROM purchase.order.line\nJOIN purchase.order WHERE state in (purchase, done)\nSorted by qty ordered desc, top 50',
              source: 'purchase.order.line → res.partner',
            }}
          >
            <DataTable data={data?.top_vendors ?? []} columns={vendorCols} isLoading={isLoading} />
          </Section>

          <Section
            title="Top Categories"
            tooltip={{
              title: 'Top Categories',
              formula: 'Qty received, qty ordered & total value\ngrouped by product category\nFROM purchase.order.line\nJOIN product.product → product.template → product.category\nSorted by total value desc',
              source: 'purchase.order.line → product.category',
            }}
          >
            <DataTable data={data?.top_categories ?? []} columns={categoryCols} isLoading={isLoading} />
          </Section>
        </div>

        {/* Incoming By Vendor */}
        <Section
          title="Incoming By Vendor"
          tooltip={{
            title: 'Incoming By Vendor',
            formula: 'PO lines where product_qty > qty_received\n(not fully received), grouped by vendor\nOrder count, qty ordered & total value\nFROM purchase.order.line\nSorted by qty ordered desc',
            source: 'purchase.order.line → res.partner',
          }}
        >
          <DataTable data={data?.incoming_by_vendor ?? []} columns={incomingCols} isLoading={isLoading} />
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
