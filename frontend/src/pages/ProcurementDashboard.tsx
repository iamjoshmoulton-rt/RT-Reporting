import { useState, useMemo } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import {
  Package, DollarSign, TrendingDown, Truck, CalendarClock,
  Tag, Percent,
} from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { CalcTooltip } from '@/components/ui/CalcTooltip'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import { PermissionGate } from '@/components/ui/PermissionGate'
import {
  useProcurementDashboardOverview,
  useProcurementDashboardFilterOptions,
} from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'

export default function ProcurementDashboard() {
  const { dateFrom, dateTo, setDateFrom, setDateTo } = useDateFilterState('procurement-dashboard')

  // Filters
  const [vendorId, setVendorId] = useState<number | undefined>()
  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [buyerId, setBuyerId] = useState<number | undefined>()

  const params = {
    date_from: dateFrom,
    date_to: dateTo,
    vendor_id: vendorId,
    category_id: categoryId,
    buyer_id: buyerId,
  }

  const { data, isLoading } = useProcurementDashboardOverview(params)
  const { data: filterOpts } = useProcurementDashboardFilterOptions()

  const kpis = data?.kpis
  const selectCls = 'rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] px-3 py-1.5 text-sm focus:outline-none focus:border-primary'

  // Column definitions
  const landedRepCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Rep' },
    { accessorKey: 'line_count', header: 'Lines' },
    { accessorKey: 'received_qty', header: 'Received', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_qty', header: 'Ordered', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_value', header: 'Value', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const incomingCatCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Category' },
    { accessorKey: 'line_count', header: 'Lines' },
    { accessorKey: 'incoming_qty', header: 'Incoming Qty', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'est_value', header: 'Est. Value', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const landedProductCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Product' },
    { accessorKey: 'sku', header: 'SKU', cell: ({ getValue }) => <span className="text-primary">{(getValue() as string) || '-'}</span> },
    { accessorKey: 'ordered_qty', header: 'Ordered', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'received_qty', header: 'Received', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_value', header: 'Value', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const landedCatCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Category' },
    { accessorKey: 'line_count', header: 'Lines' },
    { accessorKey: 'received_qty', header: 'Received', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_qty', header: 'Ordered', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_value', header: 'Value', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const incomingRepCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Rep' },
    { accessorKey: 'line_count', header: 'Lines' },
    { accessorKey: 'incoming_qty', header: 'Incoming Qty', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'est_value', header: 'Est. Value', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const incomingVendorCols: ColumnDef<any, any>[] = [
    { accessorKey: 'name', header: 'Vendor' },
    { accessorKey: 'line_count', header: 'Lines' },
    { accessorKey: 'incoming_qty', header: 'Incoming Qty', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'est_value', header: 'Est. Value', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  return (
    <PermissionGate resource="procurement.orders_chart">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-heading font-bold text-[var(--foreground)]">Procurement Dashboard</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Replicated Odoo Procurement Spreadsheet — KPIs & tables</p>
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
          <select value={vendorId ?? ''} onChange={e => setVendorId(e.target.value ? +e.target.value : undefined)} className={selectCls}>
            <option value="">All Vendors</option>
            {filterOpts?.vendors?.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select value={categoryId ?? ''} onChange={e => setCategoryId(e.target.value ? +e.target.value : undefined)} className={selectCls}>
            <option value="">All Categories</option>
            {filterOpts?.categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={buyerId ?? ''} onChange={e => setBuyerId(e.target.value ? +e.target.value : undefined)} className={selectCls}>
            <option value="">All Buyers</option>
            {filterOpts?.buyers?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Landed Units" value={kpis ? formatNumber(kpis.landed_units) : undefined} icon={Package} accent="#48cae1" loading={isLoading}
            tooltip={{ title: 'Landed Units', formula: 'SUM(qty_received)\nFROM purchase.order.line\nWHERE order state in (purchase, done)\n  AND date_order in selected range', source: 'purchase.order.line' }} />
          <KpiCard title="Landed ($)" value={kpis ? formatCurrency(kpis.landed_value) : undefined} icon={DollarSign} accent="#22c55e" loading={isLoading}
            tooltip={{ title: 'Landed ($)', formula: 'SUM(price_subtotal)\nFROM purchase.order.line\nWHERE order state in (purchase, done)\n  AND date_order in selected range', source: 'purchase.order.line' }} />
          <KpiCard title="Total Incoming Units" value={kpis ? formatNumber(kpis.incoming_units) : undefined} icon={Truck} accent="#f97316" loading={isLoading}
            tooltip={{ title: 'Total Incoming Units', formula: 'SUM(product_qty - qty_received)\nFROM purchase.order.line\nWHERE qty_received < product_qty\n  AND order state in (purchase, done)', source: 'purchase.order.line' }} />
          <KpiCard title="Total Incoming ($)" value={kpis ? formatCurrency(kpis.incoming_value) : undefined} icon={TrendingDown} accent="#a855f7" loading={isLoading}
            tooltip={{ title: 'Total Incoming ($)', formula: 'SUM((product_qty - qty_received) × price_unit)\nFROM open purchase order lines\nWHERE qty_received < product_qty', source: 'purchase.order.line' }} />
          <KpiCard title="Incoming (Filtered)" value={kpis ? formatNumber(kpis.incoming_filtered_units) : undefined} subtitle={kpis ? formatCurrency(kpis.incoming_filtered_value) : undefined} icon={CalendarClock} accent="#eab308" loading={isLoading}
            tooltip={{ title: 'Incoming (Filtered)', formula: 'Same as Total Incoming,\nbut filtered by date_planned\n(expected delivery date)\nwithin selected date range', source: 'purchase.order.line' }} />
          <KpiCard title="Avg Purchase Price" value={kpis ? formatCurrency(kpis.avg_purchase_price) : undefined} icon={Tag} accent="#06b6d4" loading={isLoading}
            tooltip={{ title: 'Avg Purchase Price', formula: 'Landed ($) / Landed Units\nDerived from confirmed PO lines' }} />
          <KpiCard title="% Chrome Landed" value={kpis ? `${kpis.chrome_landed_pct.toFixed(1)}%` : undefined} icon={Percent} accent="#ef4444" loading={isLoading}
            tooltip={{ title: '% Chrome Landed', formula: 'Landed units WHERE category\ncontains "Chromebook"\n/ Total Landed Units × 100', source: 'purchase.order.line → product.category' }} />
        </div>

        {/* Landed By Rep chart */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
          <TopItemsChart
            data={(data?.landed_by_rep ?? []).slice(0, 10).map((r: any) => ({ name: r.name, value: r.total_value }))}
            title="Landed By Rep"
            type="bar"
          />
        </div>

        {/* 3 tables row: Landed By Rep, Incoming By Category, Landed By Product */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Section title="Landed By Rep" tooltip={{ title: 'Landed By Rep', formula: 'Lines, received qty, ordered qty & value\ngrouped by buyer (res.users)\nFROM confirmed PO lines\nWHERE date_order in range', source: 'purchase.order.line → res.users' }}>
            <DataTable data={data?.landed_by_rep ?? []} columns={landedRepCols} isLoading={isLoading} />
          </Section>
          <Section title="Incoming By Category" tooltip={{ title: 'Incoming By Category', formula: 'Lines, incoming qty & est. value\ngrouped by product category\nFROM open PO lines WHERE\ndate_planned in range', source: 'purchase.order.line → product.category' }}>
            <DataTable data={data?.incoming_by_category ?? []} columns={incomingCatCols} isLoading={isLoading} />
          </Section>
          <Section title="Landed By Product" tooltip={{ title: 'Landed By Product', formula: 'Ordered qty, received qty & value\ngrouped by product (product.product)\nFROM confirmed PO lines\nORDER BY value DESC, LIMIT 30', source: 'purchase.order.line → product.product' }}>
            <DataTable data={data?.landed_by_product ?? []} columns={landedProductCols} isLoading={isLoading} />
          </Section>
        </div>

        {/* 2 tables row: Landed By Category, Incoming By Rep */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Landed By Category" tooltip={{ title: 'Landed By Category', formula: 'Lines, received qty, ordered qty & value\ngrouped by product category\nFROM confirmed PO lines\nWHERE date_order in range', source: 'purchase.order.line → product.category' }}>
            <DataTable data={data?.landed_by_category ?? []} columns={landedCatCols} isLoading={isLoading} />
          </Section>
          <Section title="Incoming By Rep" tooltip={{ title: 'Incoming By Rep', formula: 'Lines, incoming qty & est. value\ngrouped by buyer (res.users)\nFROM open PO lines WHERE\ndate_planned in range', source: 'purchase.order.line → res.users' }}>
            <DataTable data={data?.incoming_by_rep ?? []} columns={incomingRepCols} isLoading={isLoading} />
          </Section>
        </div>

        {/* Full-width: Incoming By Vendor */}
        <Section title="Incoming By Vendor" tooltip={{ title: 'Incoming By Vendor', formula: 'Lines, incoming qty & est. value\ngrouped by vendor (res.partner)\nFROM open PO lines WHERE\ndate_planned in range', source: 'purchase.order.line → res.partner' }}>
          <DataTable data={data?.incoming_by_vendor ?? []} columns={incomingVendorCols} isLoading={isLoading} />
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
