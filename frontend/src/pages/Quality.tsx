import { useState } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import { type ColumnDef } from '@tanstack/react-table'
import { ClipboardCheck, CheckCircle, AlertOctagon, Activity } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { ComparisonChart } from '@/components/charts/ComparisonChart'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import {
  useQualitySummary, useChecksByPeriod,
  usePassFailBreakdown, useQualityChecks,
} from '@/api/hooks'
import { formatNumber } from '@/lib/utils'
import { SavedFilterBar } from '@/components/ui/SavedFilterBar'


interface CheckRow {
  id: number; name: string; product_name: string; quality_state: string
  measure: number | null; qty_tested: number | null; create_date: string
}

const checkColumns: ColumnDef<CheckRow, unknown>[] = [
  { accessorKey: 'name', header: 'Check #', cell: ({ getValue }) => <span className="font-normal text-primary">{getValue() as string}</span> },
  { accessorKey: 'product_name', header: 'Product' },
  { accessorKey: 'quality_state', header: 'Result', cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  { accessorKey: 'measure', header: 'Measure', cell: ({ getValue }) => { const v = getValue() as number | null; return v != null ? v.toFixed(2) : '-' } },
  { accessorKey: 'qty_tested', header: 'Qty Tested', cell: ({ getValue }) => { const v = getValue() as number | null; return v != null ? v : '-' } },
  { accessorKey: 'create_date', header: 'Date', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
]

export function QualityPage() {
  const { dateFrom, dateTo, groupBy, compareTo, setDateFrom, setDateTo, setGroupBy, setCompareTo } = useDateFilterState('quality')
  const [page, setPage] = useState(0)
  const pageSize = 20

  const params = { date_from: dateFrom, date_to: dateTo }
  const { data: summary } = useQualitySummary(params)
  const { data: byPeriod } = useChecksByPeriod({ ...params, group_by: groupBy, compare_to: compareTo || undefined })
  const { data: breakdown } = usePassFailBreakdown(params)
  const { data: checksData, isLoading: checksLoading } = useQualityChecks({ ...params, offset: page * pageSize, limit: pageSize })

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
          pageName="quality"
          currentFilters={{ date_from: dateFrom, date_to: dateTo, group_by: groupBy, compare_to: compareTo }}
          onApplyFilter={(f) => { setDateFrom(f.date_from as string); setDateTo(f.date_to as string); setGroupBy(f.group_by as string); setCompareTo((f.compare_to as string) || '') }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PermissionGate resource="quality.summary">
          <KpiCard title="Total Checks" value={formatNumber(summary?.total_checks ?? 0)} icon={ClipboardCheck} />
        </PermissionGate>
        <PermissionGate resource="quality.summary">
          <KpiCard title="Pass Rate" value={`${summary?.pass_rate ?? 0}%`} icon={CheckCircle} />
        </PermissionGate>
        <PermissionGate resource="quality.summary">
          <KpiCard title="Open Alerts" value={formatNumber(summary?.open_alerts ?? 0)} icon={AlertOctagon} />
        </PermissionGate>
        <PermissionGate resource="quality.summary">
          <KpiCard title="Checks This Period" value={formatNumber(summary?.checks_this_period ?? 0)} icon={Activity} />
        </PermissionGate>
      </div>

      <PermissionGate resource="quality.checks_chart">
        {byPeriod && (
          <ComparisonChart
            title="Quality Checks by Period"
            currentData={byPeriod.current.map(d => ({ period: d.period, value: d.check_count }))}
            comparisonData={byPeriod.comparison?.map(d => ({ period: d.period, value: d.check_count }))}
            valueLabel="Checks"
          />
        )}
      </PermissionGate>

      <PermissionGate resource="quality.breakdown">
        {breakdown && (
          <TopItemsChart
            title="Pass / Fail Breakdown"
            data={breakdown.map(b => ({ name: b.state, value: b.count }))}
          />
        )}
      </PermissionGate>

      <PermissionGate resource="quality.check_table">
        <div>
          <h2 className="text-xl font-heading font-bold text-[var(--foreground)] mb-4">Quality Checks</h2>
          <DataTable
            data={(checksData?.checks ?? []) as unknown as CheckRow[]}
            columns={checkColumns}
            total={checksData?.total}
            pageSize={pageSize}
            page={page}
            onPageChange={setPage}
            isLoading={checksLoading}
            serverPagination
          />
        </div>
      </PermissionGate>
    </div>
  )
}
