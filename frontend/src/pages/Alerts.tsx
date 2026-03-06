import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Plus, Trash2, Check, AlertTriangle } from 'lucide-react'
import { api } from '@/api/client'
import { cn } from '@/lib/utils'

interface AlertMetric {
  key: string
  label: string
  unit: string
}

interface AlertRule {
  id: string; name: string; metric: string; condition: string
  threshold: number; notify_email: boolean; notify_push: boolean
  is_active: boolean; last_triggered_at: string | null; created_at: string
}

interface AlertHistoryItem {
  id: string; rule_id: string; metric_value: number
  message: string; acknowledged: boolean; created_at: string
}

const CONDITION_LABELS: Record<string, string> = {
  lt: 'Less than', gt: 'Greater than', eq: 'Equals',
  lte: 'Less than or equal', gte: 'Greater than or equal',
}

export function AlertsPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [metric, setMetric] = useState('')
  const [condition, setCondition] = useState('lt')
  const [threshold, setThreshold] = useState('')
  const [notifyEmail, setNotifyEmail] = useState(true)
  const [notifyPush, setNotifyPush] = useState(true)

  const { data: metrics } = useQuery({
    queryKey: ['alerts', 'metrics'],
    queryFn: () => api.get<AlertMetric[]>('/alerts/metrics'),
  })

  const { data: rules } = useQuery({
    queryKey: ['alerts', 'rules'],
    queryFn: () => api.get<AlertRule[]>('/alerts/rules'),
  })

  const { data: history } = useQuery({
    queryKey: ['alerts', 'history'],
    queryFn: () => api.get<AlertHistoryItem[]>('/alerts/history'),
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/alerts/rules', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setShowCreate(false)
      setName(''); setMetric(''); setThreshold('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/alerts/rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/alerts/history/${id}/acknowledge`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const handleCreate = () => {
    if (!name || !metric || !threshold) return
    createMutation.mutate({
      name, metric, condition,
      threshold: parseFloat(threshold),
      notify_email: notifyEmail,
      notify_push: notifyPush,
    })
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm text-white hover:bg-primary-hover transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Alert Rule
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-xl border bg-[var(--card)] p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-heading font-bold text-[var(--card-foreground)]">Create Alert Rule</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Name</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none"
                placeholder="Low stock alert"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Metric</label>
              <select
                value={metric} onChange={e => setMetric(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none"
              >
                <option value="">Select metric...</option>
                {metrics?.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Condition</label>
              <select
                value={condition} onChange={e => setCondition(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none"
              >
                {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5">Threshold</label>
              <input
                type="number" value={threshold} onChange={e => setThreshold(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none"
                placeholder="1000"
              />
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <input type="checkbox" checked={notifyEmail} onChange={e => setNotifyEmail(e.target.checked)} className="rounded" />
                Email
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <input type="checkbox" checked={notifyPush} onChange={e => setNotifyPush(e.target.checked)} className="rounded" />
                Push
              </label>
            </div>
            <div className="flex items-end">
              <button onClick={handleCreate} className="rounded-lg bg-primary px-6 py-2 text-sm text-white hover:bg-primary-hover transition-colors">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Rules */}
      <div>
        <h2 className="text-xl font-heading font-bold text-[var(--foreground)] mb-4">Active Rules</h2>
        <div className="space-y-3">
          {rules && rules.length > 0 ? rules.map(rule => (
            <div key={rule.id} className="flex items-center justify-between rounded-xl border bg-[var(--card)] px-5 py-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div className={cn('rounded-full p-2', rule.is_active ? 'bg-primary/10' : 'bg-[var(--muted)]')}>
                  <Bell className={cn('h-4 w-4', rule.is_active ? 'text-primary' : 'text-[var(--muted-foreground)]')} />
                </div>
                <div>
                  <p className="font-normal text-[var(--card-foreground)]">{rule.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {metrics?.find(m => m.key === rule.metric)?.label} {CONDITION_LABELS[rule.condition]} {rule.threshold}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {rule.last_triggered_at && (
                  <span className="text-xs text-warning">
                    Last: {new Date(rule.last_triggered_at).toLocaleDateString()}
                  </span>
                )}
                <button
                  onClick={() => deleteMutation.mutate(rule.id)}
                  className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-danger/10 hover:text-danger transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )) : (
            <div className="rounded-xl border bg-[var(--card)] p-8 text-center text-[var(--muted-foreground)]">
              No alert rules configured yet
            </div>
          )}
        </div>
      </div>

      {/* Alert History */}
      <div>
        <h2 className="text-xl font-heading font-bold text-[var(--foreground)] mb-4">Alert History</h2>
        <div className="space-y-2">
          {history && history.length > 0 ? history.map(item => (
            <div
              key={item.id}
              className={cn(
                'flex items-center justify-between rounded-xl border px-5 py-3 shadow-sm',
                item.acknowledged ? 'bg-[var(--card)]' : 'bg-warning/5 border-warning/20'
              )}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className={cn('h-4 w-4', item.acknowledged ? 'text-[var(--muted-foreground)]' : 'text-warning')} />
                <div>
                  <p className="text-sm text-[var(--card-foreground)]">{item.message}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{new Date(item.created_at).toLocaleString()}</p>
                </div>
              </div>
              {!item.acknowledged && (
                <button
                  onClick={() => acknowledgeMutation.mutate(item.id)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted-foreground)] hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <Check className="h-3 w-3 inline mr-1" />
                  Acknowledge
                </button>
              )}
            </div>
          )) : (
            <div className="rounded-xl border bg-[var(--card)] p-8 text-center text-[var(--muted-foreground)]">
              No alerts triggered yet
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
