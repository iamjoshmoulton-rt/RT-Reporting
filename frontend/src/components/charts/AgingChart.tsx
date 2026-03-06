import ReactECharts from 'echarts-for-react'
import { useTheme } from '@/hooks/useTheme'
import type { AgingData } from '@/types/api'

interface AgingChartProps {
  data: AgingData
  title: string
}

const AGING_COLORS = ['#00d084', '#48cae1', '#fcb900', '#ff6900', '#cf2e2e']
const AGING_LABELS = ['Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days']

export function AgingChart({ data, title }: AgingChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const values = [data.current, data.days_1_30, data.days_31_60, data.days_61_90, data.days_90_plus]

  const option = {
    title: {
      text: title,
      left: 'left',
      textStyle: { fontFamily: 'Oswald', fontWeight: 700, fontSize: 16, color: isDark ? '#e2e8f0' : '#1a1f3d' },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: isDark ? '#1a1f3d' : '#ffffff',
      borderColor: isDark ? '#2a3055' : '#e8edf2',
      textStyle: { color: isDark ? '#e2e8f0' : '#32373c', fontFamily: 'Oswald' },
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0]
        return `${p.name}<br/>$${p.value.toLocaleString()}`
      },
    },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: AGING_LABELS,
      axisLabel: { color: isDark ? '#94a3b8' : '#64748b', fontFamily: 'Oswald', fontSize: 11 },
      axisLine: { lineStyle: { color: isDark ? '#2a3055' : '#e8edf2' } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: {
        color: isDark ? '#94a3b8' : '#64748b', fontFamily: 'Oswald',
        formatter: (val: number) => `$${(val / 1000).toFixed(0)}k`,
      },
      splitLine: { lineStyle: { color: isDark ? '#2a3055' : '#e8edf2', type: 'dashed' as const } },
    },
    series: [{
      type: 'bar',
      data: values.map((v, i) => ({
        value: v,
        itemStyle: { color: AGING_COLORS[i], borderRadius: [4, 4, 0, 0] },
      })),
    }],
  }

  return (
    <div className="rounded-xl border bg-[var(--card)] p-6 shadow-sm">
      <ReactECharts option={option} style={{ height: 300 }} />
    </div>
  )
}
