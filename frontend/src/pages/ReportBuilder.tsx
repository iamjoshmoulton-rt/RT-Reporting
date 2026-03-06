import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Play, Save, Trash2, Table2, BarChart3, Download, FileText, FileSpreadsheet, File, Clock } from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import { api } from '@/api/client'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

interface ColumnDef { key: string; label: string; type: string }
interface JoinDef { key: string; label: string; columns: ColumnDef[] }
interface TableDef {
  label: string
  columns: ColumnDef[]
  joins?: JoinDef[]
}

interface QueryResult {
  columns: string[]
  data: Record<string, unknown>[]
  total: number
}

interface SavedReport {
  id: string; name: string; description: string | null
  config: Record<string, unknown>; is_shared: boolean; created_at: string
}

interface FilterRow {
  column: string; condition: string; value: string; value2: string
}

export function ReportBuilderPage() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [table, setTable] = useState('')
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [activeJoins, setActiveJoins] = useState<string[]>([])
  const [filters, setFilters] = useState<FilterRow[]>([])
  const [groupBy, setGroupBy] = useState('')
  const [aggregation, setAggregation] = useState('')
  const [aggColumn, setAggColumn] = useState('')
  const [orderBy, setOrderBy] = useState('')
  const [orderDir, setOrderDir] = useState('desc')
  const [limit, setLimit] = useState(100)
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [reportName, setReportName] = useState('')
  const [exporting, setExporting] = useState<string | null>(null)

  const { data: tables } = useQuery({
    queryKey: ['report-builder', 'tables'],
    queryFn: () => api.get<Record<string, TableDef>>('/report-builder/tables'),
  })

  const { data: savedReports } = useQuery({
    queryKey: ['report-builder', 'saved'],
    queryFn: () => api.get<SavedReport[]>('/report-builder/saved'),
  })

  const runMutation = useMutation({
    mutationFn: (config: Record<string, unknown>) => api.post<QueryResult>('/report-builder/query', config),
    onSuccess: (data) => setResult(data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/report-builder/saved', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-builder', 'saved'] })
      setReportName('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/report-builder/saved/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['report-builder', 'saved'] }),
  })

  const currentTable = tables?.[table]

  const toggleJoin = (joinKey: string) => {
    if (activeJoins.includes(joinKey)) {
      const join = currentTable?.joins?.find(j => j.key === joinKey)
      const joinColKeys = new Set(join?.columns.map(c => c.key) || [])
      setActiveJoins(activeJoins.filter(j => j !== joinKey))
      setSelectedColumns(selectedColumns.filter(c => !joinColKeys.has(c)))
      if (joinColKeys.has(groupBy)) setGroupBy('')
      if (joinColKeys.has(aggColumn)) setAggColumn('')
    } else {
      setActiveJoins([...activeJoins, joinKey])
    }
  }

  const handleRun = () => {
    if (!table || selectedColumns.length === 0) return
    runMutation.mutate(getQueryConfig())
  }

  const handleSave = () => {
    if (!reportName || !table) return
    saveMutation.mutate({
      name: reportName,
      config: getQueryConfig(),
      is_shared: false,
    })
  }

  const loadReport = (report: SavedReport) => {
    const c = report.config as Record<string, unknown>
    setTable(c.table as string || '')
    setSelectedColumns(c.columns as string[] || [])
    setActiveJoins(c.joins as string[] || [])
    setFilters(c.filters as FilterRow[] || [])
    setGroupBy(c.group_by as string || '')
    setAggregation(c.aggregation as string || '')
    setAggColumn(c.agg_column as string || '')
    setOrderBy(c.order_by as string || '')
    setOrderDir(c.order_dir as string || 'desc')
    setLimit(c.limit as number || 100)
  }

  const getQueryConfig = () => ({
    table, columns: selectedColumns,
    joins: activeJoins.length > 0 ? activeJoins : undefined,
    filters: filters.filter(f => f.column && f.value),
    group_by: groupBy || undefined,
    aggregation: aggregation || undefined,
    agg_column: aggColumn || undefined,
    order_by: orderBy || undefined,
    order_dir: orderDir,
    limit,
  })

  const handleExport = async (fmt: 'csv' | 'excel' | 'pdf') => {
    if (!table || selectedColumns.length === 0) return
    setExporting(fmt)
    try {
      const ext = fmt === 'excel' ? 'xlsx' : fmt
      await api.downloadPost(`/report-builder/export/${fmt}`, getQueryConfig(), `report_${table}.${ext}`)
    } finally {
      setExporting(null)
    }
  }

  const chartOption = result && groupBy && aggregation ? {
    tooltip: { trigger: 'axis' as const },
    xAxis: {
      type: 'category' as const,
      data: result.data.map(r => String(r[groupBy] ?? '')),
      axisLabel: { color: isDark ? '#94a3b8' : '#64748b', fontFamily: 'Oswald' },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: isDark ? '#94a3b8' : '#64748b', fontFamily: 'Oswald' },
    },
    series: [{ type: 'bar', data: result.data.map(r => r.agg_value), itemStyle: { color: '#48cae1', borderRadius: [4,4,0,0] } }],
  } : null

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Config Panel */}
        <div className="lg:col-span-1 space-y-4">
          {/* Saved Reports */}
          {savedReports && savedReports.length > 0 && (
            <div className="rounded-xl border bg-[var(--card)] p-4 shadow-sm">
              <h3 className="text-sm font-heading font-bold text-[var(--card-foreground)] mb-3">Saved Reports</h3>
              <div className="space-y-1.5">
                {savedReports.map(r => (
                  <div key={r.id} className="flex items-center justify-between">
                    <button onClick={() => loadReport(r)} className="text-sm text-primary hover:underline truncate flex-1 text-left">
                      {r.name}
                    </button>
                    <button
                      onClick={() => navigate(`/settings?schedule=${r.id}&name=${encodeURIComponent(r.name)}`)}
                      className="p-1 text-[var(--muted-foreground)] hover:text-primary"
                      title="Schedule this report"
                    >
                      <Clock className="h-3 w-3" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(r.id)} className="p-1 text-[var(--muted-foreground)] hover:text-danger">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-[var(--card)] p-4 shadow-sm space-y-4">
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Data Source</label>
              <select value={table} onChange={e => { setTable(e.target.value); setSelectedColumns([]); setActiveJoins([]); setFilters([]) }}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none">
                <option value="">Select table...</option>
                {tables && Object.entries(tables).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>

            {currentTable && (
              <>
                {/* Related Tables (Joins) */}
                {currentTable.joins && currentTable.joins.length > 0 && (
                  <div>
                    <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Related Tables</label>
                    <div className="flex flex-wrap gap-1.5">
                      {currentTable.joins.map(join => {
                        const active = activeJoins.includes(join.key)
                        return (
                          <button key={join.key} onClick={() => toggleJoin(join.key)}
                            className={cn(
                              'rounded-lg border px-3 py-1.5 text-xs transition-colors',
                              active
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:border-primary/30 hover:text-primary'
                            )}>
                            {active ? '✓ ' : '+ '}{join.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Columns</label>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {currentTable.columns.map(col => (
                      <label key={col.key} className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                        <input
                          type="checkbox"
                          checked={selectedColumns.includes(col.key)}
                          onChange={e => {
                            if (e.target.checked) setSelectedColumns([...selectedColumns, col.key])
                            else setSelectedColumns(selectedColumns.filter(c => c !== col.key))
                          }}
                          className="rounded"
                        />
                        {col.label}
                      </label>
                    ))}
                    {/* Joined table columns */}
                    {currentTable.joins?.filter(j => activeJoins.includes(j.key)).map(join => (
                      <div key={join.key}>
                        <div className="text-xs text-primary font-medium mt-2 mb-1 border-t border-[var(--border)] pt-2">{join.label}</div>
                        {join.columns.map(col => (
                          <label key={col.key} className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                            <input
                              type="checkbox"
                              checked={selectedColumns.includes(col.key)}
                              onChange={e => {
                                if (e.target.checked) setSelectedColumns([...selectedColumns, col.key])
                                else setSelectedColumns(selectedColumns.filter(c => c !== col.key))
                              }}
                              className="rounded"
                            />
                            {col.label}
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Group By</label>
                  <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none">
                    <option value="">None</option>
                    {currentTable.columns.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
                    {currentTable.joins?.filter(j => activeJoins.includes(j.key)).map(join => (
                      <optgroup key={join.key} label={join.label}>
                        {join.columns.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {groupBy && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Aggregation</label>
                      <select value={aggregation} onChange={e => setAggregation(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none">
                        <option value="">Select...</option>
                        <option value="count">Count</option>
                        <option value="sum">Sum</option>
                        <option value="avg">Average</option>
                        <option value="min">Min</option>
                        <option value="max">Max</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Of Column</label>
                      <select value={aggColumn} onChange={e => setAggColumn(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none">
                        <option value="">Select...</option>
                        {currentTable.columns.filter(c => c.type === 'number').map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
                        {currentTable.joins?.filter(j => activeJoins.includes(j.key)).map(join => {
                          const numCols = join.columns.filter(c => c.type === 'number')
                          return numCols.length > 0 ? (
                            <optgroup key={join.key} label={join.label}>
                              {numCols.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
                            </optgroup>
                          ) : null
                        })}
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Limit</label>
                  <input type="number" value={limit} onChange={e => setLimit(parseInt(e.target.value) || 100)} min={1} max={1000}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none" />
                </div>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={handleRun} disabled={!table || selectedColumns.length === 0}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary-hover disabled:opacity-50 transition-colors">
                <Play className="h-4 w-4" /> Run
              </button>
            </div>
          </div>

          {/* Save */}
          {result && (
            <div className="rounded-xl border bg-[var(--card)] p-4 shadow-sm space-y-3">
              <input value={reportName} onChange={e => setReportName(e.target.value)} placeholder="Report name..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none" />
              <button onClick={handleSave} disabled={!reportName}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors">
                <Save className="h-4 w-4" /> Save Report
              </button>
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-3">
          {runMutation.isPending && (
            <div className="flex items-center justify-center h-64 rounded-xl border bg-[var(--card)]">
              <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
          )}

          {result && !runMutation.isPending && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--muted-foreground)]">{result.total} rows returned</p>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {([['csv', FileText, 'CSV'], ['excel', FileSpreadsheet, 'Excel'], ['pdf', File, 'PDF']] as const).map(([fmt, Icon, label]) => (
                      <button key={fmt} onClick={() => handleExport(fmt as 'csv' | 'excel' | 'pdf')} disabled={!!exporting}
                        className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50 transition-colors">
                        <Icon className="h-3 w-3" />{exporting === fmt ? '...' : label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 rounded-lg border border-[var(--border)] p-0.5">
                    <button onClick={() => setViewMode('table')}
                      className={cn('rounded-md px-3 py-1 text-xs transition-colors',
                        viewMode === 'table' ? 'bg-primary text-white' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]')}>
                      <Table2 className="h-3 w-3 inline mr-1" />Table
                    </button>
                    <button onClick={() => setViewMode('chart')} disabled={!chartOption}
                      className={cn('rounded-md px-3 py-1 text-xs transition-colors disabled:opacity-30',
                        viewMode === 'chart' ? 'bg-primary text-white' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]')}>
                      <BarChart3 className="h-3 w-3 inline mr-1" />Chart
                    </button>
                  </div>
                </div>
              </div>

              {viewMode === 'table' ? (
                <div className="rounded-xl border bg-[var(--card)] shadow-sm overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50">
                        {Object.keys(result.data[0] || {}).map(key => (
                          <th key={key} className="px-4 py-3 text-left text-xs font-normal uppercase tracking-wider text-[var(--muted-foreground)]">
                            {key.replace(/_/g, ' ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.map((row, i) => (
                        <tr key={i} className="border-b border-[var(--border)] last:border-0">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-4 py-3 text-sm text-[var(--card-foreground)]">
                              {val === null ? '-' : typeof val === 'number' ? val.toLocaleString() : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : chartOption ? (
                <div className="rounded-xl border bg-[var(--card)] p-6 shadow-sm">
                  <ReactECharts option={chartOption} style={{ height: 400 }} />
                </div>
              ) : null}
            </div>
          )}

          {!result && !runMutation.isPending && (
            <div className="flex flex-col items-center justify-center h-64 rounded-xl border bg-[var(--card)] border-dashed">
              <Table2 className="h-10 w-10 text-[var(--muted-foreground)] mb-3" />
              <p className="text-[var(--muted-foreground)]">Select a data source and columns, then click Run</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
