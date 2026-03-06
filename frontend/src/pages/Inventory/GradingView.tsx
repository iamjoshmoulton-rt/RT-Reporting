import { useState, useMemo } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import { type ColumnDef } from '@tanstack/react-table'
import { Package, TrendingUp, DollarSign, Layers } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { GradeWidgets } from '@/components/ui/GradeWidgets'
import { StackedBarChart } from '@/components/charts/StackedBarChart'
import { DataTable } from '@/components/tables/DataTable'
import { PermissionGate } from '@/components/ui/PermissionGate'
import {
  useGradingOverview,
  useGradingItems,
} from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { GradingItem, CategoryTotal, DailyGradeData } from '@/types/api'

type GradingViewType = 'total-stocked' | 'processed-stock'
type ChartRange = '7d' | '14d' | '30d' | 'all'

interface GradingViewProps {
  view: GradingViewType
  title: string
  subtitle: string
}

const GRADE_KEYS_ORDERED = ['A', 'B', 'C', 'D', 'F', 'new_in_box', 'new_open_box'] as const
const GRADE_LABELS: Record<string, string> = {
  A: 'A', B: 'B', C: 'C', D: 'D', F: 'F',
  new_in_box: 'NIB', new_open_box: 'NOB',
}

const itemColumns: ColumnDef<GradingItem, unknown>[] = [
  { accessorKey: 'date', header: 'Date', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
  { accessorKey: 'uid', header: 'UID', cell: ({ getValue }) => <span className="font-mono text-xs">{(getValue() as string) || '-'}</span> },
  { accessorKey: 'product', header: 'Product' },
  { accessorKey: 'default_code', header: 'SKU', cell: ({ getValue }) => <span className="text-primary">{(getValue() as string) || '-'}</span> },
  { accessorKey: 'category', header: 'Category', cell: ({ getValue }) => (getValue() as string) || '-' },
  { accessorKey: 'grade', header: 'Grade', cell: ({ getValue }) => { const g = getValue() as string; return g ? <GradeBadge grade={g} /> : '-' } },
  { accessorKey: 'cost', header: 'Cost', cell: ({ getValue }) => formatCurrency(getValue() as number) },
]

function GradeBadge({ grade }: { grade: string }) {
  const colors: Record<string, string> = {
    A: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    B: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    C: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    D: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    F: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  }
  const cls = colors[grade] ?? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{grade}</span>
}

export function GradingView({ view, title, subtitle }: GradingViewProps) {
  const { dateFrom, dateTo, setDateFrom, setDateTo } = useDateFilterState(`grading-${view}`)
  const params = { date_from: dateFrom, date_to: dateTo }

  // Filters
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [costMin, setCostMin] = useState('')
  const [costMax, setCostMax] = useState('')
  const [chartRange, setChartRange] = useState<ChartRange>('all')
  const [itemPage, setItemPage] = useState(0)
  const pageSize = 50

  // Data hooks — single overview call for summary + grades + chart + categories
  const { data: overview, isLoading: overviewLoading } = useGradingOverview(view, params)
  const summary = overview?.summary
  const grades = overview?.grades
  const dailyData = overview?.daily_grades
  const catData = overview?.categories
  const { data: itemsData, isLoading: itemsLoading } = useGradingItems(view, {
    ...params,
    search: search || undefined,
    grade: gradeFilter || undefined,
    category: categoryFilter || undefined,
    cost_min: costMin ? parseFloat(costMin) : undefined,
    cost_max: costMax ? parseFloat(costMax) : undefined,
    offset: itemPage * pageSize,
    limit: pageSize,
  })

  // Chart range filter
  const filteredDailyData = useMemo(() => {
    if (!dailyData || chartRange === 'all') return dailyData ?? []
    const days = chartRange === '7d' ? 7 : chartRange === '14d' ? 14 : 30
    return dailyData.slice(-days)
  }, [dailyData, chartRange])

  // Category table columns
  const catColumns: ColumnDef<CategoryTotal, unknown>[] = useMemo(() => [
    { accessorKey: 'category', header: 'Category' },
    { accessorKey: 'total_qty', header: 'Qty', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_value', header: 'Value', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    ...GRADE_KEYS_ORDERED.map(k => ({
      accessorKey: k as string,
      header: GRADE_LABELS[k],
      cell: ({ getValue }: { getValue: () => unknown }) => {
        const v = getValue() as number
        return v > 0 ? formatNumber(v) : <span className="text-[var(--muted-foreground)]">-</span>
      },
    })),
  ], [])

  // Unique categories for filter dropdown
  const categories = useMemo(() => {
    if (!catData?.items) return []
    return catData.items.map(c => c.category).sort()
  }, [catData])

  const selectCls = 'rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] px-3 py-1.5 text-sm focus:outline-none focus:border-primary'

  return (
    <PermissionGate resource="inventory.grading">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-heading font-bold text-[var(--foreground)]">{title}</h1>
          <p className="text-sm text-[var(--muted-foreground)]">{subtitle}</p>
        </div>

        {/* Date Presets */}
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search product, UID, SKU…"
            value={search}
            onChange={e => { setSearch(e.target.value); setItemPage(0) }}
            className={`${selectCls} w-64`}
          />
          <select value={gradeFilter} onChange={e => { setGradeFilter(e.target.value); setItemPage(0) }} className={selectCls}>
            <option value="">All Grades</option>
            {['A', 'B', 'C', 'D', 'F', 'New (In Box)', 'New (Open Box)'].map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setItemPage(0) }} className={selectCls}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <input
              type="number"
              placeholder="Min $"
              value={costMin}
              onChange={e => { setCostMin(e.target.value); setItemPage(0) }}
              className={`${selectCls} w-24`}
            />
            <span className="text-[var(--muted-foreground)] text-sm">-</span>
            <input
              type="number"
              placeholder="Max $"
              value={costMax}
              onChange={e => { setCostMax(e.target.value); setItemPage(0) }}
              className={`${selectCls} w-24`}
            />
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Total Items"
            value={formatNumber(summary?.total_items ?? 0)}
            icon={Package}
            trend={summary?.trends?.total_items ?? undefined}
            accent="#48cae1"
          />
          <KpiCard
            title="Daily Average"
            value={formatNumber(summary?.daily_average ?? 0)}
            icon={TrendingUp}
            trend={summary?.trends?.daily_average ?? undefined}
            accent="#f97316"
          />
          <KpiCard
            title="Total Value"
            value={formatCurrency(summary?.total_value ?? 0)}
            icon={DollarSign}
            trend={summary?.trends?.total_value ?? undefined}
            accent="#22c55e"
          />
          <KpiCard
            title="Unique Products"
            value={formatNumber(summary?.unique_products ?? 0)}
            icon={Layers}
            trend={summary?.trends?.unique_products ?? undefined}
            accent="#a855f7"
          />
        </div>

        {/* Grade Widgets */}
        {grades && <GradeWidgets grades={grades} />}

        {/* Chart with range toggles */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            {(['7d', '14d', '30d', 'all'] as ChartRange[]).map(r => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                  chartRange === r
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-primary/10 hover:text-primary'
                }`}
              >
                {r === 'all' ? 'All' : r.toUpperCase()}
              </button>
            ))}
          </div>
          <StackedBarChart data={filteredDailyData} />
        </div>

        {/* Category Totals Table */}
        {catData && (
          <div>
            <h2 className="text-lg font-heading font-bold text-[var(--foreground)] mb-3">Totals by Category</h2>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 font-medium text-[var(--muted-foreground)]">Category</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--muted-foreground)]">Qty</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--muted-foreground)]">Value</th>
                    {GRADE_KEYS_ORDERED.map(k => (
                      <th key={k} className="text-right px-3 py-3 font-medium text-[var(--muted-foreground)]">{GRADE_LABELS[k]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catData.items.map(row => (
                    <tr key={row.category} className="border-b border-[var(--border)] hover:bg-[var(--accent)]">
                      <td className="px-4 py-2.5 font-medium text-[var(--foreground)]">{row.category}</td>
                      <td className="text-right px-4 py-2.5">{formatNumber(row.total_qty)}</td>
                      <td className="text-right px-4 py-2.5">{formatCurrency(row.total_value)}</td>
                      {GRADE_KEYS_ORDERED.map(k => (
                        <td key={k} className="text-right px-3 py-2.5">
                          {row[k] > 0 ? formatNumber(row[k]) : <span className="text-[var(--muted-foreground)]">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Grand total row */}
                  <tr className="bg-[var(--accent)] font-bold">
                    <td className="px-4 py-2.5 text-[var(--foreground)]">Grand Total</td>
                    <td className="text-right px-4 py-2.5">{formatNumber(catData.grand_total.total_qty)}</td>
                    <td className="text-right px-4 py-2.5">{formatCurrency(catData.grand_total.total_value)}</td>
                    {GRADE_KEYS_ORDERED.map(k => (
                      <td key={k} className="text-right px-3 py-2.5">
                        {catData.grand_total[k] > 0 ? formatNumber(catData.grand_total[k]) : '-'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Items Table */}
        <div>
          <h2 className="text-lg font-heading font-bold text-[var(--foreground)] mb-3">Items</h2>
          <DataTable
            data={itemsData?.items ?? []}
            columns={itemColumns}
            total={itemsData?.total}
            pageSize={pageSize}
            page={itemPage}
            onPageChange={setItemPage}
            isLoading={itemsLoading}
            serverPagination
          />
        </div>
      </div>
    </PermissionGate>
  )
}
