import { useState, useMemo } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import {
  Package, DollarSign, TrendingDown, Truck, CalendarClock,
  Tag, Percent,
} from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
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
          <KpiCard title="Landed Units" value={formatNumber(kpis?.landed_units ?? 0)} icon={Package} accent="#48cae1" />
          <KpiCard title="Landed ($)" value={formatCurrency(kpis?.landed_value ?? 0)} icon={DollarSign} accent="#22c55e" />
          <KpiCard title="Total Incoming Units" value={formatNumber(kpis?.incoming_units ?? 0)} icon={Truck} accent="#f97316" />
          <KpiCard title="Total Incoming ($)" value={formatCurrency(kpis?.incoming_value ?? 0)} icon={TrendingDown} accent="#a855f7" />
          <KpiCard title="Incoming (Filtered)" value={formatNumber(kpis?.incoming_filtered_units ?? 0)} subtitle={formatCurrency(kpis?.incoming_filtered_value ?? 0)} icon={CalendarClock} accent="#eab308" />
          <KpiCard title="Avg Purchase Price" value={formatCurrency(kpis?.avg_purchase_price ?? 0)} icon={Tag} accent="#06b6d4" />
          <KpiCard title="% Chrome Landed" value={`${(kpis?.chrome_landed_pct ?? 0).toFixed(1)}%`} icon={Percent} accent="#ef4444" />
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
          <Section title="Landed By Rep">
            <DataTable data={data?.landed_by_rep ?? []} columns={landedRepCols} isLoading={isLoading} />
          </Section>
          <Section title="Incoming By Category">
            <DataTable data={data?.incoming_by_category ?? []} columns={incomingCatCols} isLoading={isLoading} />
          </Section>
          <Section title="Landed By Product">
            <DataTable data={data?.landed_by_product ?? []} columns={landedProductCols} isLoading={isLoading} />
          </Section>
        </div>

        {/* 2 tables row: Landed By Category, Incoming By Rep */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Landed By Category">
            <DataTable data={data?.landed_by_category ?? []} columns={landedCatCols} isLoading={isLoading} />
          </Section>
          <Section title="Incoming By Rep">
            <DataTable data={data?.incoming_by_rep ?? []} columns={incomingRepCols} isLoading={isLoading} />
          </Section>
        </div>

        {/* Full-width: Incoming By Vendor */}
        <Section title="Incoming By Vendor">
          <DataTable data={data?.incoming_by_vendor ?? []} columns={incomingVendorCols} isLoading={isLoading} />
        </Section>
      </div>
    </PermissionGate>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-heading font-bold text-[var(--foreground)] mb-3">{title}</h2>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-auto">
        {children}
      </div>
    </div>
  )
}
