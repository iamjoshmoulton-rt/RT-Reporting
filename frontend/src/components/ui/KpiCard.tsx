import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { CalcTooltip, type CalcTooltipData } from './CalcTooltip'

interface KpiCardProps {
  title: string
  value: string | undefined
  subtitle?: string
  icon: LucideIcon
  trend?: number
  trendLabel?: string
  budget?: string
  className?: string
  onClick?: () => void
  accent?: string
  loading?: boolean
  tooltip?: CalcTooltipData
}

export function KpiCard({
  title, value, subtitle, icon: Icon, trend, trendLabel = 'vs prev period',
  budget, className, onClick, accent, loading, tooltip,
}: KpiCardProps) {
  const isLoading = loading || value === undefined
  const trendUp = trend !== undefined && trend >= 0

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm transition-all duration-200 overflow-hidden h-full',
        'hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {/* Accent top line */}
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: accent ?? 'var(--primary)' }}
      />

      <div className="flex items-start justify-between p-5 pt-4">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-[11px] font-medium tracking-widest uppercase text-[var(--muted-foreground)] flex items-center gap-1.5">
            {title}
            {tooltip && <CalcTooltip {...tooltip} />}
          </p>
          {isLoading ? (
            <div className="h-8 w-24 rounded bg-[var(--muted)] animate-pulse mt-1" />
          ) : (
            <p className="text-2xl sm:text-3xl font-bold font-heading text-[var(--card-foreground)] leading-tight truncate">
              {value}
            </p>
          )}
          {subtitle && (
            <p className="text-xs text-[var(--muted-foreground)] truncate">{subtitle}</p>
          )}
          {budget != null && budget !== '' && (
            <p className="text-xs text-[var(--muted-foreground)]">Budget: {budget}</p>
          )}
        </div>

        <div
          className="flex-shrink-0 rounded-xl p-3 transition-transform group-hover:scale-105"
          style={{
            backgroundColor: `color-mix(in srgb, ${accent ?? 'var(--primary)'} 12%, transparent)`,
          }}
        >
          <Icon
            className="h-5 w-5"
            style={{ color: accent ?? 'var(--primary)' }}
          />
        </div>
      </div>

      {/* Trend footer */}
      {trend !== undefined && (
        <div className="border-t border-[var(--border)] px-5 py-2 flex items-center gap-1.5">
          {trendUp ? (
            <TrendingUp className="h-3.5 w-3.5 text-success" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-danger" />
          )}
          <span className={cn('text-xs font-medium', trendUp ? 'text-success' : 'text-danger')}>
            {trendUp ? '+' : ''}{trend.toFixed(1)}%
          </span>
          <span className="text-[10px] text-[var(--muted-foreground)]">{trendLabel}</span>
        </div>
      )}
    </div>
  )
}
