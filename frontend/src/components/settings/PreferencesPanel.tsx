import { useState, useEffect } from 'react'
import { Globe, Calendar, BarChart3, Home, Palette, RefreshCw, ChevronDown } from 'lucide-react'
import { useUserPreferences, useUpdateUserPreferences } from '@/api/hooks'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const DATE_RANGE_OPTIONS = [
  { value: '', label: 'No default (This Month)' },
  { value: 'today', label: 'Today' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'last_12_months', label: 'Last 12 Months' },
  { value: 'last_year', label: 'Last Year' },
]

const GROUP_BY_OPTIONS = [
  { value: '', label: 'Default (Monthly)' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
]

const LANDING_PAGE_OPTIONS = [
  { value: '', label: 'Dashboard (default)' },
  { value: '/dashboard', label: 'Dashboard' },
  { value: '/sales', label: 'Sales' },
  { value: '/procurement', label: 'Procurement' },
  { value: '/accounting', label: 'Accounting' },
  { value: '/inventory', label: 'Inventory' },
  { value: '/manufacturing', label: 'Manufacturing' },
  { value: '/helpdesk', label: 'Helpdesk' },
  { value: '/crm', label: 'CRM' },
  { value: '/projects', label: 'Projects' },
  { value: '/customers', label: 'Customers' },
]

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const REFRESH_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
]

const MODULES = [
  { key: 'sales', label: 'Sales' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'manufacturing', label: 'Manufacturing' },
  { key: 'helpdesk', label: 'Helpdesk' },
  { key: 'crm', label: 'CRM' },
  { key: 'projects', label: 'Projects' },
  { key: 'customers', label: 'Customers' },
  { key: 'quality', label: 'Quality' },
  { key: 'inventory_processed', label: 'Inventory (Processed)' },
]

const COMMON_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver',
  'America/Mexico_City', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Europe/Amsterdam', 'Europe/Zurich', 'Europe/Moscow',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Shanghai',
  'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney', 'Pacific/Auckland',
  'UTC',
]

const selectClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none'

interface FieldProps {
  label: string
  description?: string
  icon: typeof Globe
  children: React.ReactNode
}

function Field({ label, description, icon: Icon, children }: FieldProps) {
  return (
    <div className="flex items-start gap-4 py-4 border-b border-[var(--border)] last:border-b-0">
      <div className="rounded-lg bg-primary/10 p-2.5 mt-0.5">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <label className="block text-sm font-medium text-[var(--foreground)]">{label}</label>
        {description && <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{description}</p>}
        <div className="mt-2">{children}</div>
      </div>
    </div>
  )
}

export function PreferencesPanel() {
  const { data: prefs, isLoading } = useUserPreferences()
  const updateMutation = useUpdateUserPreferences()
  const { setTheme: applyTheme } = useTheme()
  const [showModuleOverrides, setShowModuleOverrides] = useState(false)

  // Local state that syncs with server
  const [timezone, setTimezone] = useState('')
  const [dateRange, setDateRange] = useState('')
  const [groupBy, setGroupBy] = useState('')
  const [landingPage, setLandingPage] = useState('')
  const [themeVal, setThemeVal] = useState('system')
  const [autoRefresh, setAutoRefresh] = useState(0)
  const [moduleDefaults, setModuleDefaults] = useState<Record<string, { date_range?: string; group_by?: string }>>({})
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (prefs && !initialized) {
      setTimezone(prefs.timezone || '')
      setDateRange(prefs.default_date_range || '')
      setGroupBy(prefs.default_group_by || '')
      setLandingPage(prefs.landing_page || '')
      setThemeVal(prefs.theme || 'system')
      setAutoRefresh(prefs.auto_refresh_interval || 0)
      setModuleDefaults(prefs.module_defaults || {})
      setInitialized(true)
    }
  }, [prefs, initialized])

  const save = (patch: Record<string, unknown>) => {
    updateMutation.mutate(patch, {
      onSuccess: () => toast.success('Preferences saved'),
      onError: () => toast.error('Failed to save preferences'),
    })
  }

  const handleThemeChange = (value: string) => {
    setThemeVal(value)
    if (value === 'system') {
      const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      applyTheme(sys as 'light' | 'dark')
    } else {
      applyTheme(value as 'light' | 'dark')
    }
    save({ theme: value || null })
  }

  const handleModuleDefault = (moduleKey: string, field: 'date_range' | 'group_by', value: string) => {
    const updated = { ...moduleDefaults }
    if (!updated[moduleKey]) updated[moduleKey] = {}
    if (value) {
      updated[moduleKey] = { ...updated[moduleKey], [field]: value }
    } else {
      const { [field]: _, ...rest } = updated[moduleKey]
      updated[moduleKey] = rest
    }
    // Remove empty entries
    if (Object.keys(updated[moduleKey]).length === 0) delete updated[moduleKey]
    setModuleDefaults(updated)
    save({ module_defaults: updated })
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-[var(--card)] p-8 text-center text-[var(--muted-foreground)]">
        Loading preferences...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-[var(--card)] shadow-sm">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h3 className="text-lg font-heading font-bold text-[var(--card-foreground)]">Display & Defaults</h3>
          <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
            Configure how the app looks and behaves for your account
          </p>
        </div>
        <div className="px-6">
          <Field label="Timezone" description="Used for date display and scheduled reports" icon={Globe}>
            <select value={timezone} onChange={e => { setTimezone(e.target.value); save({ timezone: e.target.value || null }) }} className={selectClass}>
              <option value="">Auto-detect</option>
              {COMMON_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>

          <Field label="Theme" description="Choose your preferred color scheme" icon={Palette}>
            <div className="flex gap-2">
              {THEME_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleThemeChange(opt.value)}
                  className={cn(
                    'flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                    themeVal === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Landing Page" description="Where to go after logging in" icon={Home}>
            <select value={landingPage} onChange={e => { setLandingPage(e.target.value); save({ landing_page: e.target.value || null }) }} className={selectClass}>
              {LANDING_PAGE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </Field>

          <Field label="Auto-Refresh" description="Automatically refresh data at intervals" icon={RefreshCw}>
            <select value={autoRefresh} onChange={e => { const v = Number(e.target.value); setAutoRefresh(v); save({ auto_refresh_interval: v || null }) }} className={selectClass}>
              {REFRESH_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="rounded-xl border bg-[var(--card)] shadow-sm">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h3 className="text-lg font-heading font-bold text-[var(--card-foreground)]">Default Filters</h3>
          <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
            Set default date range and grouping used when no URL params are present
          </p>
        </div>
        <div className="px-6">
          <Field label="Default Date Range" description="Applied to all modules unless overridden below" icon={Calendar}>
            <select value={dateRange} onChange={e => { setDateRange(e.target.value); save({ default_date_range: e.target.value || null }) }} className={selectClass}>
              {DATE_RANGE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </Field>

          <Field label="Default Group By" description="Chart grouping period" icon={BarChart3}>
            <select value={groupBy} onChange={e => { setGroupBy(e.target.value); save({ default_group_by: e.target.value || null }) }} className={selectClass}>
              {GROUP_BY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* Module-specific overrides */}
      <div className="rounded-xl border bg-[var(--card)] shadow-sm">
        <button
          type="button"
          onClick={() => setShowModuleOverrides(o => !o)}
          className="w-full flex items-center justify-between px-6 py-4 text-left"
        >
          <div>
            <h3 className="text-lg font-heading font-bold text-[var(--card-foreground)]">Per-Module Overrides</h3>
            <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
              Set different defaults for specific modules
            </p>
          </div>
          <ChevronDown className={cn('h-5 w-5 text-[var(--muted-foreground)] transition-transform', showModuleOverrides && 'rotate-180')} />
        </button>

        {showModuleOverrides && (
          <div className="px-6 pb-4 border-t border-[var(--border)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm mt-4">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left py-2 pr-4 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Module</th>
                    <th className="text-left py-2 pr-4 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Date Range</th>
                    <th className="text-left py-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Group By</th>
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map(mod => (
                    <tr key={mod.key} className="border-b border-[var(--border)] last:border-b-0">
                      <td className="py-3 pr-4 font-medium text-[var(--foreground)]">{mod.label}</td>
                      <td className="py-3 pr-4">
                        <select
                          value={moduleDefaults[mod.key]?.date_range || ''}
                          onChange={e => handleModuleDefault(mod.key, 'date_range', e.target.value)}
                          className={cn(selectClass, 'w-auto min-w-[160px]')}
                        >
                          <option value="">Use global default</option>
                          {DATE_RANGE_OPTIONS.filter(o => o.value).map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3">
                        <select
                          value={moduleDefaults[mod.key]?.group_by || ''}
                          onChange={e => handleModuleDefault(mod.key, 'group_by', e.target.value)}
                          className={cn(selectClass, 'w-auto min-w-[130px]')}
                        >
                          <option value="">Use global default</option>
                          {GROUP_BY_OPTIONS.filter(o => o.value).map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
