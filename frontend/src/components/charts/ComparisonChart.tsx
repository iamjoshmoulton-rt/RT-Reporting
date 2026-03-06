import ReactECharts from 'echarts-for-react'
import { useTheme } from '@/hooks/useTheme'

interface ComparisonChartProps {
  currentData: { period: string; value: number }[]
  comparisonData?: { period: string; value: number }[] | null
  title: string
  valueLabel?: string
  valueFormatter?: (val: number) => string
}

export function ComparisonChart({
  currentData, comparisonData, title,
  valueLabel = 'Value',
  valueFormatter = (v) => `$${(v / 1000).toFixed(0)}k`,
}: ComparisonChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const textColor = isDark ? '#e2e8f0' : '#1a1f3d'
  const subColor = isDark ? '#94a3b8' : '#64748b'
  const gridColor = isDark ? '#2a305540' : '#e8edf280'
  const tooltipBg = isDark ? '#131829' : '#ffffff'
  const tooltipBorder = isDark ? '#2a3055' : '#e8edf2'

  const labels = currentData.map(d => {
    const date = new Date(d.period)
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  })

  const series: Record<string, unknown>[] = [
    {
      name: `Current ${valueLabel}`,
      type: 'bar',
      data: currentData.map(d => d.value),
      barMaxWidth: 32,
      itemStyle: {
        color: {
          type: 'linear' as const,
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: '#48cae1' },
            { offset: 1, color: isDark ? '#48cae130' : '#48cae150' },
          ],
        },
        borderRadius: [6, 6, 0, 0],
      },
      emphasis: { itemStyle: { color: '#48cae1', shadowBlur: 8, shadowColor: '#48cae140' } },
    },
  ]

  if (comparisonData && comparisonData.length > 0) {
    series.push({
      name: `Previous ${valueLabel}`,
      type: 'bar',
      data: comparisonData.map(d => d.value),
      barMaxWidth: 32,
      itemStyle: {
        color: isDark ? '#2a305580' : '#e8edf2',
        borderRadius: [6, 6, 0, 0],
      },
    })
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
      textStyle: { color: textColor, fontFamily: 'Oswald', fontSize: 13 },
    },
    legend: {
      show: !!comparisonData,
      top: 4, right: 16,
      textStyle: { color: subColor, fontFamily: 'Oswald', fontSize: 12 },
      itemWidth: 12, itemHeight: 12, icon: 'roundRect',
    },
    grid: { left: 16, right: 16, top: 50, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: labels,
      axisLabel: { color: subColor, fontFamily: 'Oswald', fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: subColor, fontFamily: 'Oswald', fontSize: 11, formatter: valueFormatter },
      splitLine: { lineStyle: { color: gridColor, type: 'dashed' as const } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series,
    animationDuration: 600,
    animationEasing: 'cubicOut',
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm h-full">
      <ReactECharts option={option} style={{ height: '100%', minHeight: 280 }} />
    </div>
  )
}
