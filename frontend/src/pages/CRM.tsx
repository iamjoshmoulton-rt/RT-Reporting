import { useState } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import { Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Users, DollarSign, Trophy, Percent } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { ComparisonChart } from '@/components/charts/ComparisonChart'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import {
  useCRMSummary, useLeadsByPeriod,
  usePipelineByStage, useCRMLeads,
} from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { ExportMenu } from '@/components/ui/ExportMenu'
import { SavedFilterBar } from '@/components/ui/SavedFilterBar'


interface LeadRow {
  id: number; name: string; partner_name: string; email_from: string
  expected_revenue: number; probability: number; priority: string
  stage_name: string; create_date: string; date_closed: string | null
}

const leadColumns: ColumnDef<LeadRow, unknown>[] = [
  { accessorKey: 'name', header: 'Lead', cell: ({ getValue, row }) => <Link to={`/crm/leads/${(row.original as Record<string, unknown>).id}`} className="font-normal text-primary hover:underline">{getValue() as string}</Link> },
  { accessorKey: 'partner_name', header: 'Contact' },
  { accessorKey: 'email_from', header: 'Email' },
  { accessorKey: 'stage_name', header: 'Stage', cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  { accessorKey: 'expected_revenue', header: 'Expected Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'probability', header: 'Probability', cell: ({ getValue }) => `${getValue() as number}%` },
  { accessorKey: 'create_date', header: 'Created', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
]

export function CRMPage() {
  const { dateFrom, dateTo, groupBy, compareTo, setDateFrom, setDateTo, setGroupBy, setCompareTo, setDateRange } = useDateFilterState('crm')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const pageSize = 20

  const params = { date_from: dateFrom, date_to: dateTo }
  const { data: summary } = useCRMSummary(params)
  const { data: byPeriod } = useLeadsByPeriod({ ...params, group_by: groupBy, compare_to: compareTo || undefined })
  const { data: pipeline } = usePipelineByStage()
  const { data: leadsData, isLoading: leadsLoading } = useCRMLeads({ ...params, offset: page * pageSize, limit: pageSize, search: search || undefined })

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="space-y-3">
        <DateRangeFilter
          dateFrom={dateFrom} dateTo={dateTo}
          onDateFromChange={setDateFrom} onDateToChange={setDateTo} onDateRangeChange={setDateRange}
          groupBy={groupBy} onGroupByChange={setGroupBy}
          compareTo={compareTo} onCompareToChange={setCompareTo}
        />
        <SavedFilterBar
          pageName="crm"
          currentFilters={{ date_from: dateFrom, date_to: dateTo, group_by: groupBy, compare_to: compareTo }}
          onApplyFilter={(f) => { setDateFrom(f.date_from as string); setDateTo(f.date_to as string); setGroupBy(f.group_by as string); setCompareTo((f.compare_to as string) || '') }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PermissionGate resource="crm.summary">
          <KpiCard title="Open Leads" value={formatNumber(summary?.open_leads ?? 0)} icon={Users}
            tooltip={{ title: 'Open Leads', formula: 'COUNT(crm.lead)\nWHERE active = true\n  AND type = opportunity\n  AND stage is not won/lost', source: 'crm.lead' }} />
        </PermissionGate>
        <PermissionGate resource="crm.summary">
          <KpiCard title="Pipeline Value" value={formatCurrency(summary?.pipeline_value ?? 0)} icon={DollarSign}
            tooltip={{ title: 'Pipeline Value', formula: 'SUM(expected_revenue)\nFROM crm.lead\nWHERE active = true\n  AND stage is not won/lost', source: 'crm.lead' }} />
        </PermissionGate>
        <PermissionGate resource="crm.summary">
          <KpiCard title="Won This Period" value={formatNumber(summary?.won_count ?? 0)} icon={Trophy}
            tooltip={{ title: 'Won This Period', formula: 'COUNT(crm.lead)\nWHERE stage_id is won stage\n  AND date_closed in selected range', source: 'crm.lead' }} />
        </PermissionGate>
        <PermissionGate resource="crm.summary">
          <KpiCard title="Conversion Rate" value={`${summary?.conversion_rate ?? 0}%`} icon={Percent}
            tooltip={{ title: 'Conversion Rate', formula: 'Won leads / Total leads × 100\nWHERE create_date in selected range\nIncludes won + lost leads', source: 'crm.lead' }} />
        </PermissionGate>
      </div>

      <PermissionGate resource="crm.pipeline">
        {pipeline && (
          <TopItemsChart
            title="Pipeline by Stage"
            data={pipeline.map(s => ({ name: s.stage_name, value: s.expected_revenue }))}
          />
        )}
      </PermissionGate>

      <PermissionGate resource="crm.leads_chart">
        {byPeriod && (
          <ComparisonChart
            title="Leads by Period"
            currentData={byPeriod.current.map(d => ({ period: d.period, value: d.lead_count }))}
            comparisonData={byPeriod.comparison?.map(d => ({ period: d.period, value: d.lead_count }))}
            valueLabel="Leads"
          />
        )}
      </PermissionGate>

      <PermissionGate resource="crm.lead_table">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-heading font-bold text-[var(--foreground)]">CRM Leads</h2>
            <ExportMenu module="crm" dateFrom={dateFrom} dateTo={dateTo} />
          </div>
          <DataTable
            data={(leadsData?.leads ?? []) as unknown as LeadRow[]}
            columns={leadColumns}
            total={leadsData?.total}
            pageSize={pageSize}
            page={page}
            onPageChange={setPage}
            isLoading={leadsLoading}
            serverPagination
            searchValue={search}
            onSearchChange={(v) => { setSearch(v); setPage(0) }}
            searchPlaceholder="Search leads…"
          />
        </div>
      </PermissionGate>
    </div>
  )
}
