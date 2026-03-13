import { useState } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import { Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { FolderOpen, ListChecks, CheckCircle, AlertTriangle } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { ComparisonChart } from '@/components/charts/ComparisonChart'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import {
  useProjectsSummary, useTasksByPeriod,
  useTasksByProject, useProjectTasks,
} from '@/api/hooks'
import { formatNumber } from '@/lib/utils'
import { ExportMenu } from '@/components/ui/ExportMenu'
import { SavedFilterBar } from '@/components/ui/SavedFilterBar'


interface TaskRow {
  id: number; name: string; project_name: string; stage_name: string
  state: string; priority: string; date_deadline: string | null
  allocated_hours: number; effective_hours: number; progress: number
  create_date: string
}

const stateLabels: Record<string, string> = {
  '01_in_progress': 'In Progress',
  '1_done': 'Done',
  '1_canceled': 'Cancelled',
  '02_changes_requested': 'Changes Requested',
  '03_approved': 'Approved',
}

const taskColumns: ColumnDef<TaskRow, unknown>[] = [
  { accessorKey: 'name', header: 'Task', cell: ({ getValue, row }) => <Link to={`/projects/tasks/${(row.original as Record<string, unknown>).id}`} className="font-normal text-primary hover:underline">{getValue() as string}</Link> },
  { accessorKey: 'project_name', header: 'Project' },
  { accessorKey: 'stage_name', header: 'Stage' },
  { accessorKey: 'state', header: 'State', cell: ({ getValue }) => { const v = getValue() as string; return <StatusBadge status={stateLabels[v] || v} /> } },
  { accessorKey: 'priority', header: 'Priority', cell: ({ getValue }) => <StatusBadge status={(getValue() as string) || '0'} /> },
  { accessorKey: 'date_deadline', header: 'Deadline', cell: ({ getValue }) => { const v = getValue() as string | null; return v ? new Date(v).toLocaleDateString() : '-' } },
  { accessorKey: 'progress', header: 'Progress', cell: ({ getValue }) => `${getValue() as number ?? 0}%` },
  { accessorKey: 'create_date', header: 'Created', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
]

export function ProjectsPage() {
  const { dateFrom, dateTo, groupBy, compareTo, setDateFrom, setDateTo, setGroupBy, setCompareTo, setDateRange } = useDateFilterState('projects')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const pageSize = 20

  const params = { date_from: dateFrom, date_to: dateTo }
  const { data: summary } = useProjectsSummary(params)
  const { data: byPeriod } = useTasksByPeriod({ ...params, group_by: groupBy, compare_to: compareTo || undefined })
  const { data: byProject } = useTasksByProject({ limit: 10 })
  const { data: tasksData, isLoading: tasksLoading } = useProjectTasks({ ...params, offset: page * pageSize, limit: pageSize, search: search || undefined })

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
          pageName="projects"
          currentFilters={{ date_from: dateFrom, date_to: dateTo, group_by: groupBy, compare_to: compareTo }}
          onApplyFilter={(f) => { setDateFrom(f.date_from as string); setDateTo(f.date_to as string); setGroupBy(f.group_by as string); setCompareTo((f.compare_to as string) || '') }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PermissionGate resource="projects.summary">
          <KpiCard title="Active Projects" value={formatNumber(summary?.active_projects ?? 0)} icon={FolderOpen}
            tooltip={{ title: 'Active Projects', formula: 'COUNT(project.project)\nWHERE active = true\n  AND stage is not closed', source: 'project.project' }} />
        </PermissionGate>
        <PermissionGate resource="projects.summary">
          <KpiCard title="Open Tasks" value={formatNumber(summary?.open_tasks ?? 0)} icon={ListChecks}
            tooltip={{ title: 'Open Tasks', formula: 'COUNT(project.task)\nWHERE state = 01_in_progress\n  AND active = true', source: 'project.task' }} />
        </PermissionGate>
        <PermissionGate resource="projects.summary">
          <KpiCard title="Completed This Period" value={formatNumber(summary?.completed_tasks ?? 0)} icon={CheckCircle}
            tooltip={{ title: 'Completed This Period', formula: 'COUNT(project.task)\nWHERE state = 1_done\n  AND date_last_stage_update\n  in selected range', source: 'project.task' }} />
        </PermissionGate>
        <PermissionGate resource="projects.summary">
          <KpiCard title="Overdue Tasks" value={formatNumber(summary?.overdue_tasks ?? 0)} icon={AlertTriangle}
            tooltip={{ title: 'Overdue Tasks', formula: 'COUNT(project.task)\nWHERE date_deadline < today\n  AND state != 1_done\n  AND active = true', source: 'project.task' }} />
        </PermissionGate>
      </div>

      <PermissionGate resource="projects.by_project">
        {byProject && (
          <TopItemsChart
            title="Tasks by Project"
            data={byProject.map(p => ({ name: p.project_name, value: p.task_count }))}
          />
        )}
      </PermissionGate>

      <PermissionGate resource="projects.tasks_chart">
        {byPeriod && (
          <ComparisonChart
            title="Task Completions by Period"
            currentData={byPeriod.current.map(d => ({ period: d.period, value: d.task_count }))}
            comparisonData={byPeriod.comparison?.map(d => ({ period: d.period, value: d.task_count }))}
            valueLabel="Completed Tasks"
          />
        )}
      </PermissionGate>

      <PermissionGate resource="projects.task_table">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-heading font-bold text-[var(--foreground)]">Project Tasks</h2>
            <ExportMenu module="projects" dateFrom={dateFrom} dateTo={dateTo} />
          </div>
          <DataTable
            data={(tasksData?.tasks ?? []) as unknown as TaskRow[]}
            columns={taskColumns}
            total={tasksData?.total}
            pageSize={pageSize}
            page={page}
            onPageChange={setPage}
            isLoading={tasksLoading}
            serverPagination
            searchValue={search}
            onSearchChange={(v) => { setSearch(v); setPage(0) }}
            searchPlaceholder="Search tasks…"
          />
        </div>
      </PermissionGate>
    </div>
  )
}
