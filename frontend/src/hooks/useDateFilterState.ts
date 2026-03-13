import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUserPreferences } from '@/api/hooks'

/** Compute default from/to matching "This Month" preset. */
function getDefaultDates() {
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = now.toISOString().slice(0, 10)
  return { from, to }
}

/** Resolve a preset label to a date range. */
function resolvePreset(preset: string): { from: string; to: string } | null {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  switch (preset) {
    case 'today': {
      const t = fmt(now)
      return { from: t, to: t }
    }
    case 'last_7_days': {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      return { from: fmt(d), to: fmt(now) }
    }
    case 'last_30_days': {
      const d = new Date(now); d.setDate(d.getDate() - 29)
      return { from: fmt(d), to: fmt(now) }
    }
    case 'this_month': {
      return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: fmt(now) }
    }
    case 'last_month': {
      const d = new Date(); d.setMonth(d.getMonth() - 1)
      const y = d.getFullYear(); const m = d.getMonth() + 1
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${new Date(y, m, 0).getDate()}` }
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3)
      return { from: `${now.getFullYear()}-${pad(q * 3 + 1)}-01`, to: fmt(now) }
    }
    case 'last_quarter': {
      let q = Math.floor(now.getMonth() / 3) - 1; let y = now.getFullYear()
      if (q < 0) { q = 3; y-- }
      const sm = q * 3 + 1; const em = q * 3 + 3
      return { from: `${y}-${pad(sm)}-01`, to: `${y}-${pad(em)}-${new Date(y, em, 0).getDate()}` }
    }
    case 'ytd': {
      return { from: `${now.getFullYear()}-01-01`, to: fmt(now) }
    }
    case 'last_12_months': {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1)
      return { from: fmt(d), to: fmt(now) }
    }
    case 'last_year': {
      const y = now.getFullYear() - 1
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    }
    default:
      return null
  }
}

/**
 * URL-synced date filter state with user preference fallback.
 *
 * Priority: URL params > user module defaults > user global defaults > "This Month"
 */
export function useDateFilterState(moduleName: string) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: prefs } = useUserPreferences()

  // Resolve the effective defaults from preferences
  const prefDefaults = useMemo(() => {
    if (!prefs) return null

    const modulePrefs = prefs.module_defaults?.[moduleName]
    const dateRangeKey = modulePrefs?.date_range || prefs.default_date_range
    const groupByVal = modulePrefs?.group_by || prefs.default_group_by

    let dates: { from: string; to: string } | null = null
    if (dateRangeKey) dates = resolvePreset(dateRangeKey)

    return { dates, groupBy: groupByVal || null }
  }, [prefs, moduleName])

  const fallback = useMemo(() => getDefaultDates(), [])

  // Read from URL, fall back to preferences, then to defaults
  const dateFrom = searchParams.get('date_from')
    || prefDefaults?.dates?.from
    || fallback.from

  const dateTo = searchParams.get('date_to')
    || prefDefaults?.dates?.to
    || fallback.to

  const groupBy = searchParams.get('group_by')
    || prefDefaults?.groupBy
    || 'month'

  const compareTo = searchParams.get('compare_to') ?? 'previous_period'

  // Setters that update URL search params (preserving other params)
  const updateParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        if (value) {
          next.set(key, value)
        } else {
          next.delete(key)
        }
        return next
      }, { replace: true })
    },
    [setSearchParams]
  )

  const setDateFrom = useCallback((v: string) => updateParam('date_from', v), [updateParam])
  const setDateTo = useCallback((v: string) => updateParam('date_to', v), [updateParam])
  const setGroupBy = useCallback((v: string) => updateParam('group_by', v), [updateParam])
  const setCompareTo = useCallback((v: string) => updateParam('compare_to', v), [updateParam])

  /** Set both dates in a single URL update — avoids race condition with two separate setSearchParams calls. */
  const setDateRange = useCallback(
    (from: string, to: string) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        if (from) next.set('date_from', from)
        else next.delete('date_from')
        if (to) next.set('date_to', to)
        else next.delete('date_to')
        return next
      }, { replace: true })
    },
    [setSearchParams]
  )

  return {
    dateFrom,
    dateTo,
    groupBy,
    compareTo,
    setDateFrom,
    setDateTo,
    setDateRange,
    setGroupBy,
    setCompareTo,
  }
}
