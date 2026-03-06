import ReactECharts from 'echarts-for-react'
import { useTheme } from '@/hooks/useTheme'
import type { PeriodData } from '@/types/api'

interface RevenueChartProps {
  data: PeriodData[]
  title?: string
}

export function RevenueChart({ data, title = 'Revenue Trend' }: RevenueChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const textColor = isDark ? '#e2e8f0' : '#1a1f3d'
  const subColor = isDark ? '#94a3b8' : '#64748b'
  const gridColor = isDark ? '#2a305540' : '#e8edf280'
  const tooltipBg = isDark ? '#131829' : '#ffffff'
  const tooltipBorder = isDark ? '#2a3055' : '#e8edf2'

  const option = {
    title: {
      text: title,
      left: 16,
      top: 4,
      textStyle: { fontFamily: 'Oswald', fontWeight: 700, fontSize: 15, color: textColor },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderRadius: 8,
      padding: [10, 14],
      textStyle: { color: textColor, fontFamily: 'Oswald', fontSize: 13 },
      axisPointer: { type: 'shadow' as const, shadowStyle: { color: isDark ? 'rgba(72,202,225,0.06)' : 'rgba(72,202,225,0.08)' } },
      formatter: (params: { name: string; value: number; seriesName: string; marker: string }[]) => {
        const label = params[0]?.name ?? ''
        const rows = params.map(p => `${p.marker} ${p.seriesName}: <b>$${(p.value / 1000).toFixed(1)}k</b>`)
        return `<div style="font-family:Oswald;font-weight:300"><b>${label}</b><br/>${rows.join('<br/>')}</div>`
      },
    },
    grid: { left: 16, right: 16, top: 50, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: data.map(d => {
        const date = new Date(d.period)
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      }),
      axisLabel: { color: subColor, fontFamily: 'Oswald', fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: {
        color: subColor, fontFamily: 'Oswald', fontSize: 11,
        formatter: (val: number) => `$${(val / 1000).toFixed(0)}k`,
      },
      splitLine: { lineStyle: { color: gridColor, type: 'dashed' as const } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: 'Revenue',
        type: 'bar',
        data: data.map(d => d.revenue),
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
      {
        name: 'Trend',
        type: 'line',
        data: data.map(d => d.revenue),
        smooth: 0.4,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: false,
        lineStyle: { color: '#00d084', width: 2.5, shadowBlur: 6, shadowColor: '#00d08440' },
        itemStyle: { color: '#00d084', borderWidth: 2, borderColor: isDark ? '#131829' : '#ffffff' },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#00d08420' },
              { offset: 1, color: '#00d08400' },
            ],
          },
        },
        emphasis: { showSymbol: true, symbolSize: 8 },
      },
    ],
    animationDuration: 600,
    animationEasing: 'cubicOut',
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm h-full">
      <ReactECharts option={option} style={{ height: '100%', minHeight: 280 }} />
    </div>
  )
}
