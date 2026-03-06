import { cn } from '@/lib/utils'

interface DateRangeFilterProps {
  dateFrom: string
  dateTo: string
  onDateFromChange: (v: string) => void
  onDateToChange: (v: string) => void
  groupBy?: string
  onGroupByChange?: (v: string) => void
  compareTo?: string
  onCompareToChange?: (v: string) => void
  className?: string
}

function pad2(n: number) { return String(n).padStart(2, '0') }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}` }

const PRESETS = [
  { label: 'Today', getRange: () => { const t = fmtDate(new Date()); return { from: t, to: t } } },
  { label: 'Last 7 Days', getRange: () => { const now = new Date(); const d = new Date(now); d.setDate(d.getDate()-6); return { from: fmtDate(d), to: fmtDate(now) } } },
  { label: 'Last 30 Days', getRange: () => { const now = new Date(); const d = new Date(now); d.setDate(d.getDate()-29); return { from: fmtDate(d), to: fmtDate(now) } } },
  { label: 'This Month', getRange: () => { const now = new Date(); return { from: `${now.getFullYear()}-${pad2(now.getMonth()+1)}-01`, to: fmtDate(now) } } },
  { label: 'Last Month', getRange: () => { const d = new Date(); d.setMonth(d.getMonth()-1); const y=d.getFullYear(); const m=d.getMonth()+1; return { from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${new Date(y,m,0).getDate()}` } } },
  { label: 'This Quarter', getRange: () => { const now=new Date(); const q=Math.floor(now.getMonth()/3); return { from: `${now.getFullYear()}-${pad2(q*3+1)}-01`, to: fmtDate(now) } } },
  { label: 'Last Quarter', getRange: () => { const now=new Date(); let q=Math.floor(now.getMonth()/3)-1; let y=now.getFullYear(); if(q<0){q=3;y--} const sm=q*3+1; const em=q*3+3; return { from: `${y}-${pad2(sm)}-01`, to: `${y}-${pad2(em)}-${new Date(y,em,0).getDate()}` } } },
  { label: 'YTD', getRange: () => { const y=new Date().getFullYear(); return { from: `${y}-01-01`, to: fmtDate(new Date()) } } },
  { label: 'Last 12 Mo', getRange: () => { const now=new Date(); const d=new Date(now); d.setFullYear(d.getFullYear()-1); d.setDate(d.getDate()+1); return { from: fmtDate(d), to: fmtDate(now) } } },
  { label: 'Last Year', getRange: () => { const y=new Date().getFullYear()-1; return { from: `${y}-01-01`, to: `${y}-12-31` } } },
]

function isPresetActive(preset: typeof PRESETS[number], dateFrom: string, dateTo: string) {
  const range = preset.getRange()
  return range.from === dateFrom && range.to === dateTo
}

const baseInput =
  'rounded-lg border px-3 py-1.5 text-sm focus:outline-none transition-colors'
const inactiveInput =
  'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:border-primary'
const activeInput =
  'border-primary bg-primary/10 text-primary focus:border-primary'

export function DateRangeFilter({
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  groupBy, onGroupByChange, compareTo, onCompareToChange, className,
}: DateRangeFilterProps) {
  const hasComparison = !!compareTo
  const isNonDefaultGroup = !!groupBy && groupBy !== 'month'

  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {/* Presets */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(p => {
          const active = isPresetActive(p, dateFrom, dateTo)
          return (
            <button
              key={p.label}
              onClick={() => { const r = p.getRange(); onDateFromChange(r.from); onDateToChange(r.to) }}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs transition-colors',
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-primary/10 hover:text-primary hover:border-primary/30'
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="date"
          value={dateFrom}
          onChange={e => onDateFromChange(e.target.value)}
          className={cn(baseInput, dateFrom ? activeInput : inactiveInput)}
        />
        <span className="text-[var(--muted-foreground)] text-sm">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => onDateToChange(e.target.value)}
          className={cn(baseInput, dateTo ? activeInput : inactiveInput)}
        />
      </div>

      {onGroupByChange && (
        <select
          value={groupBy}
          onChange={e => onGroupByChange(e.target.value)}
          className={cn(baseInput, isNonDefaultGroup ? activeInput : inactiveInput)}
        >
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
          <option value="year">Yearly</option>
        </select>
      )}

      {onCompareToChange && (
        <select
          value={compareTo || ''}
          onChange={e => onCompareToChange(e.target.value)}
          className={cn(baseInput, hasComparison ? activeInput : inactiveInput)}
        >
          <option value="">No Comparison</option>
          <option value="previous_period">Previous Period</option>
          <option value="previous_year">Previous Year</option>
          <option value="budget">Vs Budget</option>
        </select>
      )}
    </div>
  )
}
