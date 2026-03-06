import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Calendar, Clock, FolderKanban, Tag, Timer,
  TrendingUp, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { useTaskDetail } from '@/api/hooks'

function InfoItem({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 mt-0.5 text-[var(--muted-foreground)]" />
      <div>
        <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
        <p className="text-sm text-[var(--card-foreground)]">{value}</p>
      </div>
    </div>
  )
}

function ProgressBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
        <span className="text-xs font-bold font-heading text-[var(--card-foreground)]">{Math.round(percent)}%</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--muted)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function SectionCard({ title, icon: Icon, children, accent }: {
  title: string; icon: typeof Calendar; children: React.ReactNode; accent?: string
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3 border-b border-[var(--border)]">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: `color-mix(in srgb, ${accent ?? 'var(--primary)'} 12%, transparent)` }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: accent ?? 'var(--primary)' }} />
        </div>
        <h3 className="text-sm font-heading font-bold text-[var(--card-foreground)]">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

const STATE_MAP: Record<string, { label: string; color: string }> = {
  '01_in_progress': { label: 'In Progress', color: '#0693e3' },
  '02_changes_requested': { label: 'Changes Requested', color: '#fcb900' },
  '03_approved': { label: 'Approved', color: '#48cae1' },
  '1_done': { label: 'Done', color: '#00d084' },
  '1_canceled': { label: 'Cancelled', color: '#ef4444' },
}

const formatHours = (h: number | null) => {
  if (h == null || h === 0) return 'N/A'
  return `${h.toFixed(1)}h`
}

export function ProjectTaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const taskId = id ? Number(id) : null
  const { data, isLoading } = useTaskDetail(taskId)

  const task = data?.task
  const stateInfo = STATE_MAP[task?.state ?? ''] ?? { label: task?.state || 'Unknown', color: '#94a3b8' }
  const progress = task?.progress ?? 0
  const isOvertime = (task?.overtime ?? 0) > 0
  const isOverdue = task?.date_deadline && !task.date_end && new Date(task.date_deadline) < new Date()

  return (
    <PermissionGate resource="projects.task_table">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <button
          onClick={() => navigate('/projects')}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !task ? (
          <div className="text-center py-20 text-[var(--muted-foreground)]">Task not found</div>
        ) : (
          <>
            {/* Header with accent bar */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: stateInfo.color }} />
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-heading font-bold text-[var(--card-foreground)]">{task.name}</h1>
                    {task.stage_name && <StatusBadge status={task.stage_name} />}
                    <span
                      className="px-2.5 py-0.5 text-xs font-medium rounded-full"
                      style={{ color: stateInfo.color, backgroundColor: `color-mix(in srgb, ${stateInfo.color} 12%, transparent)` }}
                    >
                      {stateInfo.label}
                    </span>
                    {isOverdue && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full"
                        style={{ color: '#ef4444', backgroundColor: 'color-mix(in srgb, #ef4444 12%, transparent)' }}
                      >
                        <AlertTriangle className="h-3 w-3" /> Overdue
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {task.project_name && (
                      <span className="text-sm text-primary">{task.project_name}</span>
                    )}
                    {task.priority === '1' && (
                      <span className="text-xs text-[var(--muted-foreground)]">Urgent</span>
                    )}
                  </div>
                  {task.create_date && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      Created {new Date(task.create_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-3xl font-heading font-bold text-[var(--card-foreground)]">
                    {progress}%
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">Progress</p>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard title="Allocated" value={formatHours(task.allocated_hours)} icon={Clock} accent="#48cae1" />
              <KpiCard title="Time Spent" value={formatHours(task.effective_hours)} icon={Timer} accent="#0693e3" />
              <KpiCard
                title="Overtime"
                value={formatHours(task.overtime)}
                icon={AlertTriangle}
                accent={isOvertime ? '#ef4444' : '#94a3b8'}
              />
              <KpiCard title="Progress" value={`${progress}%`} icon={TrendingUp} accent="#00d084" />
            </div>

            {/* Task progress section */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h3 className="text-sm font-heading font-bold text-[var(--card-foreground)] mb-4">
                Task Progress
              </h3>
              <ProgressBar label="Completion" percent={progress} color="#00d084" />
              {task.allocated_hours != null && task.allocated_hours > 0 && task.effective_hours != null && (
                <div className="mt-4">
                  <ProgressBar
                    label="Time Budget Used"
                    percent={Math.round((task.effective_hours / task.allocated_hours) * 100)}
                    color={task.effective_hours > task.allocated_hours ? '#ef4444' : '#48cae1'}
                  />
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[var(--border)]">
                <div className="text-center">
                  <p className="text-lg font-heading font-bold text-[var(--card-foreground)]">
                    {formatHours(task.allocated_hours)}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">Allocated</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-heading font-bold text-[var(--card-foreground)]">
                    {formatHours(task.effective_hours)}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">Spent</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-heading font-bold ${isOvertime ? 'text-danger' : 'text-[var(--card-foreground)]'}`}>
                    {formatHours(task.overtime)}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">Overtime</p>
                </div>
              </div>
            </div>

            {/* Details & Dates */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Task Details" icon={FolderKanban} accent="#0693e3">
                <div className="space-y-0">
                  <InfoItem icon={FolderKanban} label="Project" value={task.project_name} />
                  <InfoItem icon={Tag} label="Stage" value={task.stage_name} />
                  <InfoItem icon={Tag} label="Priority" value={task.priority === '1' ? 'Urgent' : 'Normal'} />
                  <InfoItem icon={CheckCircle2} label="State" value={stateInfo.label} />
                </div>
              </SectionCard>

              <SectionCard title="Key Dates" icon={Calendar} accent="#9b51e0">
                <div className="space-y-0">
                  <InfoItem icon={Calendar} label="Created" value={task.create_date ? new Date(task.create_date).toLocaleDateString() : null} />
                  <InfoItem icon={Clock} label="Assigned" value={task.date_assign ? new Date(task.date_assign).toLocaleDateString() : null} />
                  <InfoItem icon={Calendar} label="Deadline" value={task.date_deadline ? new Date(task.date_deadline).toLocaleDateString() : null} />
                  <InfoItem icon={CheckCircle2} label="Completed" value={task.date_end ? new Date(task.date_end).toLocaleDateString() : null} />
                  <InfoItem icon={Calendar} label="Last Stage Update" value={task.date_last_stage_update ? new Date(task.date_last_stage_update).toLocaleDateString() : null} />
                </div>
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </PermissionGate>
  )
}
