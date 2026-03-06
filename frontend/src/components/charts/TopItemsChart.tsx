import ReactECharts from 'echarts-for-react'
import { useTheme } from '@/hooks/useTheme'

interface TopItemsChartProps {
  data: { name: string; value: number }[]
  title: string
  type?: 'bar' | 'pie'
}

const COLORS = ['#48cae1', '#00d084', '#fcb900', '#9b51e0', '#ff6900', '#0693e3', '#f78da7', '#abb8c3']

export function TopItemsChart({ data, title, type = 'bar' }: TopItemsChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const textColor = isDark ? '#e2e8f0' : '#1a1f3d'
  const subColor = isDark ? '#94a3b8' : '#64748b'
  const gridColor = isDark ? '#2a305540' : '#e8edf280'
  const tooltipBg = isDark ? '#131829' : '#ffffff'
  const tooltipBorder = isDark ? '#2a3055' : '#e8edf2'
  const cardBg = isDark ? '#1a1f3d' : '#ffffff'

  const pieOption = {
    title: {
      text: title,
      left: 16, top: 4,
      textStyle: { fontFamily: 'Oswald', fontWeight: 700, fontSize: 15, color: textColor },
    },
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderRadius: 8,
      padding: [10, 14],
      textStyle: { color: textColor, fontFamily: 'Oswald', fontSize: 13 },
      formatter: (p: { name: string; value: number; percent: number; marker: string }) =>
        `<div style="font-family:Oswald;font-weight:300">${p.marker} <b>${p.name}</b><br/>$${(p.value / 1000).toFixed(1)}k (${p.percent.toFixed(1)}%)</div>`,
    },
    legend: {
      orient: 'vertical' as const,
      right: 16, top: 'middle',
      textStyle: { color: subColor, fontFamily: 'Oswald', fontSize: 12 },
      itemGap: 10,
      itemWidth: 12,
      itemHeight: 12,
      icon: 'circle',
    },
    series: [{
      type: 'pie',
      radius: ['45%', '72%'],
      center: ['35%', '55%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 8,
        borderColor: cardBg,
        borderWidth: 3,
      },
      label: { show: false },
      emphasis: {
        scaleSize: 6,
        label: { show: false },
        itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.2)' },
      },
      data: data.slice(0, 8).map((d, i) => ({
        name: d.name,
        value: d.value,
        itemStyle: { color: COLORS[i % COLORS.length] },
      })),
    }],
    animationDuration: 600,
    animationEasing: 'cubicOut',
  }

  const barOption = {
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
      formatter: (params: { name: string; value: number; marker: string }[]) => {
        const p = params[0]
        return `<div style="font-family:Oswald;font-weight:300">${p.marker} <b>${p.name}</b><br/>$${(p.value / 1000).toFixed(1)}k</div>`
      },
    },
    grid: { left: 16, right: 24, top: 50, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value' as const,
      axisLabel: {
        color: subColor, fontFamily: 'Oswald', fontSize: 11,
        formatter: (val: number) => `$${(val / 1000).toFixed(0)}k`,
      },
      splitLine: { lineStyle: { color: gridColor, type: 'dashed' as const } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category' as const,
      data: data.slice(0, 10).map(d => d.name).reverse(),
      axisLabel: {
        color: subColor, fontFamily: 'Oswald', fontSize: 11,
        width: 120, overflow: 'truncate' as const,
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: data.slice(0, 10).map((d, i) => ({
        value: d.value,
        itemStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: COLORS[0] },
              { offset: 1, color: isDark ? '#48cae160' : '#48cae190' },
            ],
          },
        },
      })).reverse(),
      barMaxWidth: 24,
      itemStyle: { borderRadius: [0, 6, 6, 0] },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: '#48cae140' } },
    }],
    animationDuration: 600,
    animationEasing: 'cubicOut',
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm h-full">
      <ReactECharts option={type === 'pie' ? pieOption : barOption} style={{ height: '100%', minHeight: 280 }} />
    </div>
  )
}
