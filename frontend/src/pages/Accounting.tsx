import { useState } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import { type ColumnDef } from '@tanstack/react-table'
import { DollarSign, Receipt, TrendingUp, AlertTriangle } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { ComparisonChart } from '@/components/charts/ComparisonChart'
import { AgingChart } from '@/components/charts/AgingChart'
import { DataTable } from '@/components/tables/DataTable'
import {
  useAccountingSummary, useRevenueByPeriod,
  useReceivableAging, usePayableAging, useInvoices,
} from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { ExportMenu } from '@/components/ui/ExportMenu'
import { SavedFilterBar } from '@/components/ui/SavedFilterBar'


interface InvoiceRow {
  id: number; name: string; move_type: string; date: string
  invoice_date_due: string; amount_total: number; amount_residual: number
  payment_state: string; partner_name: string
}

const MOVE_TYPE_LABELS: Record<string, string> = {
  out_invoice: 'Invoice', out_refund: 'Credit Note',
  in_invoice: 'Bill', in_refund: 'Debit Note',
}

const invoiceColumns: ColumnDef<InvoiceRow, unknown>[] = [
  { accessorKey: 'name', header: 'Number', cell: ({ getValue }) => <span className="font-normal text-primary">{getValue() as string}</span> },
  { accessorKey: 'partner_name', header: 'Partner' },
  { accessorKey: 'move_type', header: 'Type', cell: ({ getValue }) => MOVE_TYPE_LABELS[getValue() as string] || (getValue() as string) },
  { accessorKey: 'date', header: 'Date', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
  { accessorKey: 'invoice_date_due', header: 'Due Date', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
  { accessorKey: 'amount_total', header: 'Total', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'amount_residual', header: 'Due', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-warning font-normal">{formatCurrency(v)}</span> : <span className="text-success">{formatCurrency(0)}</span> } },
  { accessorKey: 'payment_state', header: 'Payment', cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
]

export function AccountingPage() {
  const { dateFrom, dateTo, groupBy, compareTo, setDateFrom, setDateTo, setGroupBy, setCompareTo } = useDateFilterState('accounting')
  const [moveType, setMoveType] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 20

  const params = { date_from: dateFrom, date_to: dateTo }
  const { data: summary } = useAccountingSummary(params)
  const { data: byPeriod } = useRevenueByPeriod({ ...params, group_by: groupBy, compare_to: compareTo || undefined })
  const { data: receivableAging } = useReceivableAging()
  const { data: payableAging } = usePayableAging()
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices({
    ...params,
    move_type: moveType || undefined,
    offset: page * pageSize,
    limit: pageSize,
  })

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
          pageName="accounting"
          currentFilters={{ date_from: dateFrom, date_to: dateTo, group_by: groupBy, compare_to: compareTo }}
          onApplyFilter={(f) => { setDateFrom(f.date_from as string); setDateTo(f.date_to as string); setGroupBy(f.group_by as string); setCompareTo((f.compare_to as string) || '') }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PermissionGate resource="accounting.pl_statement">
          <KpiCard title="Net Revenue" value={formatCurrency(summary?.net_revenue ?? 0)} icon={TrendingUp} />
        </PermissionGate>
        <PermissionGate resource="accounting.pl_statement">
          <KpiCard title="Invoices" value={formatNumber(summary?.invoices.count ?? 0)} subtitle={formatCurrency(summary?.invoices.total ?? 0)} icon={Receipt} />
        </PermissionGate>
        <PermissionGate resource="accounting.receivable_aging">
          <KpiCard title="Outstanding Receivable" value={formatCurrency(summary?.invoices.outstanding ?? 0)} icon={AlertTriangle} />
        </PermissionGate>
        <PermissionGate resource="accounting.payable_aging">
          <KpiCard title="Outstanding Payable" value={formatCurrency(summary?.bills.outstanding ?? 0)} icon={DollarSign} />
        </PermissionGate>
      </div>

      <PermissionGate resource="accounting.pl_statement">
        {byPeriod && (
          <ComparisonChart
            title="Invoice Revenue by Period"
            currentData={byPeriod.current.map(d => ({ period: d.period, value: d.total }))}
            comparisonData={byPeriod.comparison?.map(d => ({ period: d.period, value: d.total }))}
            valueLabel="Revenue"
          />
        )}
      </PermissionGate>

      {/* Aging Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PermissionGate resource="accounting.receivable_aging">
          {receivableAging && <AgingChart data={receivableAging} title="Accounts Receivable Aging" />}
        </PermissionGate>
        <PermissionGate resource="accounting.payable_aging">
          {payableAging && <AgingChart data={payableAging} title="Accounts Payable Aging" />}
        </PermissionGate>
      </div>

      {/* Invoice/Bill Table */}
      <PermissionGate resource="accounting.journal_entries">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-heading font-bold text-[var(--foreground)]">Invoices & Bills</h2>
            <div className="flex items-center gap-2">
              <select
                value={moveType}
                onChange={e => { setMoveType(e.target.value); setPage(0) }}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none"
              >
                <option value="">All Types</option>
                <option value="out_invoice">Customer Invoices</option>
                <option value="out_refund">Credit Notes</option>
                <option value="in_invoice">Vendor Bills</option>
                <option value="in_refund">Debit Notes</option>
              </select>
              <ExportMenu module="accounting" dateFrom={dateFrom} dateTo={dateTo} extraParams={{ move_type: moveType || undefined }} />
            </div>
          </div>
          <DataTable
            data={(invoicesData?.invoices ?? []) as unknown as InvoiceRow[]}
            columns={invoiceColumns}
            total={invoicesData?.total}
            pageSize={pageSize}
            page={page}
            onPageChange={setPage}
            isLoading={invoicesLoading}
            serverPagination
          />
        </div>
      </PermissionGate>
    </div>
  )
}
