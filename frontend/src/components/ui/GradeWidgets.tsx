import type { GradeBreakdownItem } from '@/types/api'

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#eab308',
  C: '#f97316',
  D: '#ef4444',
  F: '#6b7280',
  new_in_box: '#3b82f6',
  new_open_box: '#a855f7',
}

const GRADE_SHORT: Record<string, string> = {
  A: 'A', B: 'B', C: 'C', D: 'D', F: 'F',
  new_in_box: 'NIB', new_open_box: 'NOB',
}

interface GradeWidgetsProps {
  grades: GradeBreakdownItem[]
}

export function GradeWidgets({ grades }: GradeWidgetsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {grades.map(g => {
        const color = GRADE_COLORS[g.key] ?? '#6b7280'
        const label = GRADE_SHORT[g.key] ?? g.grade
        return (
          <div
            key={g.key}
            className="relative rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm overflow-hidden"
          >
            <div
              className="absolute inset-x-0 top-0 h-[3px]"
              style={{ background: color }}
            />
            <div className="flex items-center gap-2 mb-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs font-medium tracking-wider uppercase text-[var(--muted-foreground)]">
                {g.grade}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-heading text-[var(--card-foreground)]">
                {g.count.toLocaleString()}
              </span>
              <span className="text-sm text-[var(--muted-foreground)]">
                {g.percentage}%
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
