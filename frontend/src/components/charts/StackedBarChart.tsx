import ReactECharts from 'echarts-for-react'
import { useTheme } from '@/hooks/useTheme'
import type { DailyGradeData } from '@/types/api'

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#eab308',
  C: '#f97316',
  D: '#ef4444',
  F: '#6b7280',
  new_in_box: '#3b82f6',
  new_open_box: '#a855f7',
}

const GRADE_LABELS: Record<string, string> = {
  A: 'Grade A',
  B: 'Grade B',
  C: 'Grade C',
  D: 'Grade D',
  F: 'Grade F',
  new_in_box: 'New (In Box)',
  new_open_box: 'New (Open Box)',
}

const GRADE_KEYS = ['A', 'B', 'C', 'D', 'F', 'new_in_box', 'new_open_box'] as const

interface StackedBarChartProps {
  data: DailyGradeData[]
  title?: string
}

export function StackedBarChart({ data, title = 'Daily Volume by Grade' }: StackedBarChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const textColor = isDark ? '#e2e8f0' : '#1a1f3d'
  const subColor = isDark ? '#94a3b8' : '#64748b'
  const gridColor = isDark ? '#2a305540' : '#e8edf280'
  const tooltipBg = isDark ? '#131829' : '#ffffff'
  const tooltipBorder = isDark ? '#2a3055' : '#e8edf2'

  const dates = data.map(d => {
    const dt = new Date(d.date + 'T00:00:00')
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })

  const series = GRADE_KEYS.map(key => ({
    name: GRADE_LABELS[key],
    type: 'bar' as const,
    stack: 'grades',
    data: data.map(d => d[key]),
    itemStyle: { color: GRADE_COLORS[key], borderRadius: 0 },
    emphasis: { itemStyle: { shadowBlur: 6, shadowColor: `${GRADE_COLORS[key]}40` } },
  }))

  // Round top corners on the topmost visible series
  if (series.length > 0) {
    series[series.length - 1].itemStyle = {
      ...series[series.length - 1].itemStyle,
      borderRadius: [3, 3, 0, 0],
    }
  }

  const option = {
    title: {
      text: title,
      left: 16, top: 4,
      textStyle: { fontFamily: 'Oswald', fontWeight: 700, fontSize: 15, color: textColor },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderRadius: 8,
      padding: [10, 14],
      textStyle: { color: textColor, fontFamily: 'Oswald', fontSize: 12 },
      axisPointer: { type: 'shadow' as const, shadowStyle: { color: isDark ? '#ffffff08' : '#00000008' } },
    },
    legend: {
      top: 4, right: 16,
      textStyle: { color: subColor, fontFamily: 'Oswald', fontSize: 11 },
      itemWidth: 10, itemHeight: 10, icon: 'roundRect',
      itemGap: 12,
    },
    grid: { left: 16, right: 16, top: 50, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: dates,
      axisLabel: { color: subColor, fontFamily: 'Oswald', fontSize: 10, rotate: data.length > 14 ? 45 : 0 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: subColor, fontFamily: 'Oswald', fontSize: 11 },
      splitLine: { lineStyle: { color: gridColor, type: 'dashed' as const } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series,
    animationDuration: 600,
    animationEasing: 'cubicOut',
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <ReactECharts option={option} style={{ height: 320 }} />
    </div>
  )
}
