import { useState } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import { Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Ticket, MailOpen, MailCheck, Clock } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { ComparisonChart } from '@/components/charts/ComparisonChart'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import {
  useHelpdeskSummary, useTicketsByPeriod,
  useTicketsByStage, useHelpdeskTickets,
} from '@/api/hooks'
import { formatNumber } from '@/lib/utils'
import { ExportMenu } from '@/components/ui/ExportMenu'
import { SavedFilterBar } from '@/components/ui/SavedFilterBar'


interface TicketRow {
  id: number; ticket_ref: string; name: string; partner_name: string
  partner_email: string; priority: string; stage_name: string
  team_name: string; create_date: string; close_date: string | null
}

const ticketColumns: ColumnDef<TicketRow, unknown>[] = [
  { accessorKey: 'ticket_ref', header: 'Ticket #', cell: ({ getValue, row }) => <Link to={`/helpdesk/tickets/${(row.original as Record<string, unknown>).id}`} className="font-normal text-primary hover:underline">{getValue() as string}</Link> },
  { accessorKey: 'name', header: 'Subject' },
  { accessorKey: 'partner_name', header: 'Contact' },
  { accessorKey: 'team_name', header: 'Team' },
  { accessorKey: 'stage_name', header: 'Stage', cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  { accessorKey: 'priority', header: 'Priority', cell: ({ getValue }) => <StatusBadge status={(getValue() as string) || '0'} /> },
  { accessorKey: 'create_date', header: 'Created', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
  { accessorKey: 'close_date', header: 'Closed', cell: ({ getValue }) => { const v = getValue() as string | null; return v ? new Date(v).toLocaleDateString() : '-' } },
]

export function HelpdeskPage() {
  const { dateFrom, dateTo, groupBy, compareTo, setDateFrom, setDateTo, setGroupBy, setCompareTo } = useDateFilterState('helpdesk')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const pageSize = 20

  const params = { date_from: dateFrom, date_to: dateTo }
  const { data: summary } = useHelpdeskSummary(params)
  const { data: byPeriod } = useTicketsByPeriod({ ...params, group_by: groupBy, compare_to: compareTo || undefined })
  const { data: byStage } = useTicketsByStage(params)
  const { data: ticketsData, isLoading: ticketsLoading } = useHelpdeskTickets({ ...params, offset: page * pageSize, limit: pageSize, search: search || undefined })

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
          pageName="helpdesk"
          currentFilters={{ date_from: dateFrom, date_to: dateTo, group_by: groupBy, compare_to: compareTo }}
          onApplyFilter={(f) => { setDateFrom(f.date_from as string); setDateTo(f.date_to as string); setGroupBy(f.group_by as string); setCompareTo((f.compare_to as string) || '') }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PermissionGate resource="helpdesk.summary">
          <KpiCard title="Open Tickets" value={formatNumber(summary?.open_tickets ?? 0)} icon={Ticket} />
        </PermissionGate>
        <PermissionGate resource="helpdesk.summary">
          <KpiCard title="New This Period" value={formatNumber(summary?.new_tickets ?? 0)} icon={MailOpen} />
        </PermissionGate>
        <PermissionGate resource="helpdesk.summary">
          <KpiCard title="Closed This Period" value={formatNumber(summary?.closed_tickets ?? 0)} icon={MailCheck} />
        </PermissionGate>
        <PermissionGate resource="helpdesk.summary">
          <KpiCard title="Avg Resolution Days" value={`${summary?.avg_resolution_days ?? 0}d`} icon={Clock} />
        </PermissionGate>
      </div>

      <PermissionGate resource="helpdesk.tickets_chart">
        {byPeriod && (
          <ComparisonChart
            title="Tickets by Period"
            currentData={byPeriod.current.map(d => ({ period: d.period, value: d.ticket_count }))}
            comparisonData={byPeriod.comparison?.map(d => ({ period: d.period, value: d.ticket_count }))}
            valueLabel="Tickets"
          />
        )}
      </PermissionGate>

      <PermissionGate resource="helpdesk.by_stage">
        {byStage && (
          <TopItemsChart
            title="Tickets by Stage"
            data={byStage.map(s => ({ name: s.stage_name, value: s.ticket_count }))}
          />
        )}
      </PermissionGate>

      <PermissionGate resource="helpdesk.ticket_table">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-heading font-bold text-[var(--foreground)]">Helpdesk Tickets</h2>
            <ExportMenu module="helpdesk" dateFrom={dateFrom} dateTo={dateTo} />
          </div>
          <DataTable
            data={(ticketsData?.tickets ?? []) as unknown as TicketRow[]}
            columns={ticketColumns}
            total={ticketsData?.total}
            pageSize={pageSize}
            page={page}
            onPageChange={setPage}
            isLoading={ticketsLoading}
            serverPagination
            searchValue={search}
            onSearchChange={(v) => { setSearch(v); setPage(0) }}
            searchPlaceholder="Search tickets…"
          />
        </div>
      </PermissionGate>
    </div>
  )
}
