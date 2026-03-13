import { CalcTooltip } from '@/components/ui/CalcTooltip'
import { DataTable } from '@/components/tables/DataTable'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { useOperationsProcessingOverview } from '@/api/hooks'
import { formatNumber, formatCurrency } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useTheme } from '@/hooks/useTheme'
import { Package, CheckSquare } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'

const COLORS = [
  '#48cae1', '#00d084', '#fcb900', '#9b51e0', '#ff6900',
  '#0693e3', '#f78da7', '#abb8c3', '#ff5252', '#7c4dff',
  '#64dd17', '#ff6e40', '#18ffff', '#eeff41',
]

export default function OperationsProcessing() {
  const { data, isLoading } = useOperationsProcessingOverview()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const kpis = data?.kpis

  // Stage table columns
  const stageCols: ColumnDef<any, any>[] = useMemo(() => [
    { accessorKey: 'stage', header: 'PO Stage', size: 180 },
    { accessorKey: 'po_count', header: 'PO Count', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'qty', header: 'Qty', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'verified_count', header: 'Verified Count', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total', header: '$ Total', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'qty_running_total', header: 'Qty Running Total', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'vc_running_total', header: 'VC Running Total', cell: ({ getValue }) => formatNumber(getValue() as number) },
  ], [])

  // Stacked bar chart option
  const chartOption = useMemo(() => {
    if (!data?.by_category) return null
    const { series: categories, data: chartData } = data.by_category
    const textColor = isDark ? '#e2e8f0' : '#1a1f3d'
    const subColor = isDark ? '#94a3b8' : '#64748b'
    const gridColor = isDark ? '#2a305540' : '#e8edf280'
    const tooltipBg = isDark ? '#131829' : '#ffffff'
    const tooltipBorder = isDark ? '#2a3055' : '#e8edf2'

    return {
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderRadius: 8,
        padding: [10, 14],
        textStyle: { color: textColor, fontFamily: 'Oswald', fontSize: 12 },
      },
      legend: {
        data: categories.slice(0, 12),
        bottom: 0,
        textStyle: { color: subColor, fontFamily: 'Oswald', fontSize: 11 },
        itemGap: 10,
        itemWidth: 12,
        itemHeight: 12,
        icon: 'circle',
      },
      grid: { left: 16, right: 16, top: 16, bottom: 60, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: chartData.map((d: any) => d.stage),
        axisLabel: {
          color: subColor,
          fontFamily: 'Oswald',
          fontSize: 10,
          rotate: 35,
          interval: 0,
        },
        axisLine: { lineStyle: { color: gridColor } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: {
          color: subColor,
          fontFamily: 'Oswald',
          fontSize: 11,
          formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`,
        },
        splitLine: { lineStyle: { color: gridColor, type: 'dashed' as const } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: categories.slice(0, 12).map((cat: string, i: number) => ({
        name: cat,
        type: 'bar',
        stack: 'total',
        barMaxWidth: 40,
        data: chartData.map((d: any) => d[cat] || 0),
        itemStyle: { color: COLORS[i % COLORS.length] },
        emphasis: { focus: 'series' as const },
      })),
      animationDuration: 600,
      animationEasing: 'cubicOut',
    }
  }, [data?.by_category, isDark])

  return (
    <PermissionGate resource="operations_processing.view">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-heading font-bold text-[var(--foreground)]">
            Operations / Processing
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            PO pipeline stage overview — units in each processing stage
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KpiCard
            title="Unprocessed Total"
            value={kpis ? formatNumber(kpis.unprocessed_total) : undefined}
            subtitle="Everything before ETL"
            icon={Package}
            loading={isLoading}
            tooltip={{
              title: 'Unprocessed Total',
              formula: 'SUM(product_qty)\nFROM purchase_order_line\nJOIN purchase_order\nWHERE po_stage IN\n(Landed → Grading)',
              source: 'purchase_order → purchase_order_stage',
            }}
          />
          <KpiCard
            title="Unprocessed (VC Total)"
            value={kpis ? formatNumber(kpis.unprocessed_vc_total) : undefined}
            subtitle="Everything before ETL"
            icon={CheckSquare}
            loading={isLoading}
            tooltip={{
              title: 'Unprocessed VC Total',
              formula: 'SUM(qty_received)\nFROM purchase_order_line\nJOIN purchase_order\nWHERE po_stage IN\n(Landed → Grading)',
              source: 'purchase_order → purchase_order_stage',
            }}
          />
        </div>

        {/* PO Overview Table */}
        <Section
          title="PO Overview"
          tooltip={{
            title: 'PO Overview',
            formula: 'Confirmed/done POs grouped by\npurchase_order_stage\nQty = SUM(product_qty)\nVerified Count = SUM(qty_received)\n$ Total = SUM(price_subtotal)',
            source: 'purchase_order → purchase_order_line',
          }}
        >
          <DataTable
            data={data?.stages ?? []}
            columns={stageCols}
            isLoading={isLoading}
          />
        </Section>

        {/* By Category Chart */}
        <div>
          <h2 className="text-lg font-heading font-bold text-[var(--foreground)] mb-3 flex items-center gap-2">
            By Category
            <CalcTooltip
              title="By Category"
              formula="Qty per stage per product_category\nFROM purchase_order_line\nJOIN product → product_template → product_category"
              source="purchase_order_line → product_category"
            />
          </h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm p-4">
            {isLoading || !chartOption ? (
              <div className="h-[400px] flex items-center justify-center">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <ReactECharts option={chartOption} style={{ height: 400 }} />
            )}
          </div>
        </div>
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
