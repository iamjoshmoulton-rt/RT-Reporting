import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, Plus, Trash2, Play, Mail, Bell, BellOff, Smartphone, Users, Shield, Sliders, LifeBuoy, FileSpreadsheet } from 'lucide-react'
import { api } from '@/api/client'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useSupportSettings, useUpdateSupportSettings } from '@/api/hooks'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { UsersPanel } from '@/components/settings/UsersPanel'
import { RolesPanel } from '@/components/settings/RolesPanel'
import { PreferencesPanel } from '@/components/settings/PreferencesPanel'

interface ScheduledReport {
  id: string; name: string; report_type: string; cron_expression: string
  recipients: string[]; filters: Record<string, unknown>; attachment_format: string
  is_active: boolean; last_sent_at: string | null; created_at: string
}

interface SavedReportOption {
  id: string; name: string; config: Record<string, unknown>
}

const REPORT_TYPES = [
  { value: 'summary', label: 'Executive Summary' },
  { value: 'sales', label: 'Sales Report' },
  { value: 'procurement', label: 'Procurement Report' },
  { value: 'accounting', label: 'Accounting Report' },
  { value: 'inventory', label: 'Inventory Report' },
  { value: 'helpdesk', label: 'Helpdesk Report' },
  { value: 'crm', label: 'CRM Report' },
  { value: 'manufacturing', label: 'Manufacturing Report' },
  { value: 'projects', label: 'Projects Report' },
  { value: 'report_builder', label: 'Saved Report Builder Query' },
]

function getNextCronRun(cron: string): string {
  const parts = cron.split(' ')
  if (parts.length < 5) return ''
  const [min, hr, dom, , dow] = parts
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const h = hr.includes('/') ? `every ${hr.split('/')[1]}h` : `${hr.padStart(2, '0')}:${min.padStart(2, '0')}`
  if (dow !== '*') {
    const dayList = dow.split(',').map(d => days[Number(d)] || d).join(', ')
    return `${dayList} at ${h}`
  }
  if (dom !== '*') return `Day ${dom} at ${h}`
  return `Daily at ${h}`
}

const CRON_PRESETS = [
  { label: 'Daily at 8am', value: '0 8 * * *' },
  { label: 'Monday 8am', value: '0 8 * * 1' },
  { label: 'Mon & Fri 8am', value: '0 8 * * 1,5' },
  { label: '1st of month 8am', value: '0 8 1 * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
]

type SettingsTab = 'general' | 'preferences' | 'users' | 'roles'

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const push = usePushNotifications()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [reportType, setReportType] = useState('summary')
  const [cron, setCron] = useState('0 8 * * 1')
  const [recipients, setRecipients] = useState('')
  const [attachmentFormat, setAttachmentFormat] = useState('excel')
  const [savedReportId, setSavedReportId] = useState('')

  // Auto-open create form when navigated from Report Builder with ?schedule=<id>
  useEffect(() => {
    const scheduleId = searchParams.get('schedule')
    const scheduleName = searchParams.get('name')
    if (scheduleId) {
      setReportType('report_builder')
      setSavedReportId(scheduleId)
      if (scheduleName) setName(scheduleName)
      setShowCreate(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data: savedReports } = useQuery({
    queryKey: ['report-builder', 'saved'],
    queryFn: () => api.get<SavedReportOption[]>('/report-builder/saved'),
  })

  const { data: reports } = useQuery({
    queryKey: ['scheduled-reports'],
    queryFn: () => api.get<ScheduledReport[]>('/scheduled-reports'),
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/scheduled-reports', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] })
      setShowCreate(false)
      setName(''); setRecipients('')
      toast.success('Scheduled report created')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/scheduled-reports/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] })
      toast.success('Scheduled report deleted')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/scheduled-reports/${id}`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] }),
  })

  const testMutation = useMutation({
    mutationFn: (id: string) => api.post(`/scheduled-reports/${id}/test`),
    onSuccess: () => toast.success('Test email sent to your address'),
    onError: () => toast.error('Failed to send test email'),
  })

  const handleCreate = () => {
    if (!name || !recipients) return
    if (reportType === 'report_builder' && !savedReportId) return
    const filters: Record<string, string> = {}
    if (reportType === 'report_builder') filters.saved_report_id = savedReportId
    createMutation.mutate({
      name, report_type: reportType, cron_expression: cron,
      recipients: recipients.split(',').map(r => r.trim()).filter(Boolean),
      attachment_format: attachmentFormat,
      filters,
    })
  }

  const tabs: { id: SettingsTab; label: string; icon: typeof Sliders }[] = [
    { id: 'general', label: 'General', icon: Sliders },
    { id: 'preferences', label: 'Preferences', icon: Sliders },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'roles', label: 'Roles & Permissions', icon: Shield },
  ]

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="border-b border-[var(--border)]">
        <nav className="flex gap-1" aria-label="Settings tabs">
          {tabs.map((tab) => {
            const isPublic = tab.id === 'general' || tab.id === 'preferences'
            const button = (
              <button
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
            if (isPublic) return <span key={tab.id}>{button}</span>
            return (
              <PermissionGate key={tab.id} resource="settings.users" action="manage" fallback={null}>
                {button}
              </PermissionGate>
            )
          })}
        </nav>
      </div>

      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Push Notifications */}
          {push.isSupported && (
            <div className="rounded-xl border bg-[var(--card)] p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-primary/10 p-3">
                    <Smartphone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-[var(--card-foreground)]">Push Notifications</h3>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Receive real-time alerts on your device when events occur
                    </p>
                  </div>
                </div>
                <button
                  onClick={push.isSubscribed ? push.unsubscribe : push.subscribe}
                  disabled={push.isLoading}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm transition-colors',
                    push.isSubscribed
                      ? 'border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-danger/10 hover:text-danger'
                      : 'bg-primary text-white hover:bg-primary-hover'
                  )}
                >
                  {push.isSubscribed ? (
                    <><BellOff className="h-4 w-4" /> Disable</>
                  ) : (
                    <><Bell className="h-4 w-4" /> Enable</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Support Email */}
          <PermissionGate resource="settings.users" action="manage" fallback={null}>
            <SupportEmailCard />
          </PermissionGate>

          {/* Scheduled Reports Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-heading font-bold text-[var(--foreground)]">Scheduled Reports</h2>
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm text-white hover:bg-primary-hover transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Schedule
              </button>
            </div>

            {showCreate && (
              <div className="rounded-xl border bg-[var(--card)] p-6 shadow-sm space-y-4">
                <h3 className="text-lg font-heading font-bold text-[var(--card-foreground)]">Create Scheduled Report</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Name</label>
                    <input value={name} onChange={e => setName(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none"
                      placeholder="Weekly Sales Report" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Report Type</label>
                    <select value={reportType} onChange={e => setReportType(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none">
                      {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  {reportType === 'report_builder' && (
                    <div>
                      <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Saved Report</label>
                      <select value={savedReportId} onChange={e => setSavedReportId(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none">
                        <option value="">Select a saved report...</option>
                        {savedReports?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Schedule</label>
                    <select value={cron} onChange={e => setCron(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none">
                      {CRON_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Recipients (comma-separated emails)</label>
                    <input value={recipients} onChange={e => setRecipients(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none"
                      placeholder="alice@refreshedtech.com, bob@refreshedtech.com" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Attachment</label>
                    <select value={attachmentFormat} onChange={e => setAttachmentFormat(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none">
                      <option value="excel">Excel (.xlsx)</option>
                      <option value="pdf">PDF</option>
                      <option value="both">Both</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={handleCreate} className="rounded-lg bg-primary px-6 py-2 text-sm text-white hover:bg-primary-hover transition-colors">
                    Create Schedule
                  </button>
                  <button onClick={() => setShowCreate(false)} className="rounded-lg border border-[var(--border)] px-6 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {reports && reports.length > 0 ? reports.map(report => (
                <div key={report.id} className="flex items-center justify-between rounded-xl border bg-[var(--card)] px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className={cn('rounded-full p-2', report.is_active ? 'bg-primary/10' : 'bg-[var(--muted)]')}>
                      <Clock className={cn('h-4 w-4', report.is_active ? 'text-primary' : 'text-[var(--muted-foreground)]')} />
                    </div>
                    <div>
                      <p className="font-normal text-[var(--card-foreground)]">{report.name}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {report.report_type === 'report_builder' && <FileSpreadsheet className="h-3 w-3 inline mr-1" />}
                        {REPORT_TYPES.find(t => t.value === report.report_type)?.label} &bull; {getNextCronRun(report.cron_expression)}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        <Mail className="h-3 w-3 inline mr-1" />{report.recipients.join(', ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {report.last_sent_at && (
                      <span className="text-xs text-[var(--muted-foreground)]">
                        Last: {new Date(report.last_sent_at).toLocaleDateString()}
                      </span>
                    )}
                    <button
                      onClick={() => testMutation.mutate(report.id)}
                      className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted-foreground)] hover:bg-primary/10 hover:text-primary transition-colors"
                      title="Send test"
                    >
                      <Play className="h-3 w-3 inline mr-1" />Test
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate({ id: report.id, is_active: !report.is_active })}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs transition-colors',
                        report.is_active ? 'bg-success/10 text-success' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                      )}
                    >
                      {report.is_active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(report.id)}
                      className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-danger/10 hover:text-danger transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border bg-[var(--card)] p-8 text-center text-[var(--muted-foreground)]">
                  No scheduled reports configured yet
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'preferences' && (
        <PreferencesPanel />
      )}

      {activeTab === 'users' && (
        <PermissionGate resource="settings.users" action="manage">
          <UsersPanel />
        </PermissionGate>
      )}

      {activeTab === 'roles' && (
        <PermissionGate resource="settings.users" action="manage">
          <RolesPanel />
        </PermissionGate>
      )}
    </div>
  )
}


function SupportEmailCard() {
  const { data } = useSupportSettings()
  const updateMutation = useUpdateSupportSettings()
  const [email, setEmail] = useState('')
  const [initialized, setInitialized] = useState(false)

  if (data && !initialized) {
    setEmail(data.support_email)
    setInitialized(true)
  }

  const handleSave = () => {
    updateMutation.mutate(
      { support_email: email },
      { onSuccess: () => toast.success('Support email updated') },
    )
  }

  return (
    <div className="rounded-xl border bg-[var(--card)] p-6 shadow-sm">
      <div className="flex items-center gap-4 mb-4">
        <div className="rounded-full bg-primary/10 p-3">
          <LifeBuoy className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-heading font-bold text-[var(--card-foreground)]">Bug Report Recipient</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Bug reports submitted via the support widget will be emailed to this address
          </p>
        </div>
      </div>
      <div className="flex gap-3">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="admin@example.com"
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none"
        />
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="rounded-lg bg-primary px-5 py-2 text-sm text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
