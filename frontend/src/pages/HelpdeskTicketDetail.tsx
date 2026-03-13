import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, User, Mail, Calendar, Clock, Star, Shield, Tag,
  CheckCircle2, AlertTriangle, Timer,
} from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { useTicketDetail } from '@/api/hooks'

function InfoItem({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string | null | undefined }) {
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

function SectionCard({ title, icon: Icon, children, accent }: {
  title: string; icon: typeof Shield; children: React.ReactNode; accent?: string
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

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  '0': { label: 'Low', color: '#94a3b8' },
  '1': { label: 'Medium', color: '#48cae1' },
  '2': { label: 'High', color: '#fcb900' },
  '3': { label: 'Urgent', color: '#ef4444' },
}

export function HelpdeskTicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const ticketId = id ? Number(id) : null
  const { data, isLoading } = useTicketDetail(ticketId)

  const ticket = data?.ticket
  const priority = PRIORITY_MAP[ticket?.priority ?? '0'] ?? PRIORITY_MAP['0']

  // SLA status
  const slaColor = ticket?.sla_reached === true ? '#00d084'
    : ticket?.sla_reached === false ? '#ef4444'
    : '#94a3b8'
  const slaLabel = ticket?.sla_reached === true ? 'Met'
    : ticket?.sla_reached === false ? 'Breached'
    : 'N/A'

  return (
    <PermissionGate resource="helpdesk.ticket_table">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <button
          onClick={() => navigate('/helpdesk')}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Helpdesk
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !ticket ? (
          <div className="text-center py-20 text-[var(--muted-foreground)]">Ticket not found</div>
        ) : (
          <>
            {/* Header with accent bar */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: priority.color }} />
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-heading font-bold text-[var(--card-foreground)]">
                      {ticket.ticket_ref}
                    </h1>
                    {ticket.stage_name && <StatusBadge status={ticket.stage_name} />}
                    <span
                      className="px-2.5 py-0.5 text-xs font-medium rounded-full"
                      style={{ color: priority.color, backgroundColor: `color-mix(in srgb, ${priority.color} 12%, transparent)` }}
                    >
                      {priority.label}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)] mt-1">{ticket.name}</p>
                  {ticket.create_date && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      Created {new Date(ticket.create_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {ticket.resolution_days != null ? (
                    <>
                      <p className="text-3xl font-heading font-bold text-[var(--card-foreground)]">
                        {ticket.resolution_days}d
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">Resolution Time</p>
                    </>
                  ) : (
                    <>
                      <p className="text-3xl font-heading font-bold" style={{ color: '#48cae1' }}>Open</p>
                      <p className="text-xs text-[var(--muted-foreground)]">Status</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard
                title="Resolution Time"
                value={ticket.resolution_days != null ? `${ticket.resolution_days}d` : 'Open'}
                icon={Timer}
                accent="#48cae1"
                tooltip={{ title: 'Resolution Time', formula: 'close_date − create_date (in days)\nShows "Open" if ticket not yet closed', source: 'helpdesk_ticket → close_date − create_date' }}
              />
              <KpiCard
                title="SLA Status"
                value={slaLabel}
                icon={Shield}
                accent={slaColor}
                tooltip={{ title: 'SLA Status', formula: 'Met: closed before SLA deadline\nBreached: closed after SLA deadline\nN/A: no SLA policy assigned', source: 'helpdesk_ticket → sla_reached' }}
              />
              <KpiCard
                title="Rating"
                value={ticket.rating_last_value != null ? `${ticket.rating_last_value}/5` : 'N/A'}
                icon={Star}
                accent="#fcb900"
                tooltip={{ title: 'Customer Rating', formula: 'Last customer satisfaction rating\nScale: 1 (poor) to 5 (excellent)\nN/A if no rating submitted', source: 'helpdesk_ticket → rating_last_value' }}
              />
              <KpiCard
                title="Priority"
                value={priority.label}
                icon={AlertTriangle}
                accent={priority.color}
                tooltip={{ title: 'Priority Level', formula: '0 = Low, 1 = Medium\n2 = High, 3 = Urgent\nSet by agent or auto-rules', source: 'helpdesk_ticket → priority' }}
              />
            </div>

            {/* SLA Timeline */}
            {(ticket.sla_deadline || ticket.assign_date || ticket.close_date) && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <h3 className="text-sm font-heading font-bold text-[var(--card-foreground)] mb-4">
                  Ticket Timeline
                </h3>
                <div className="flex items-center gap-1">
                  {[
                    { label: 'Created', date: ticket.create_date, color: '#94a3b8', icon: Clock },
                    { label: 'Assigned', date: ticket.assign_date, color: '#0693e3', icon: User },
                    { label: 'SLA Deadline', date: ticket.sla_deadline, color: '#fcb900', icon: AlertTriangle },
                    { label: 'Closed', date: ticket.close_date, color: '#00d084', icon: CheckCircle2 },
                  ].filter(step => step.date).map((step, i, arr) => (
                    <div key={step.label} className="flex items-center flex-1">
                      <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-full"
                          style={{ backgroundColor: `color-mix(in srgb, ${step.color} 15%, transparent)` }}
                        >
                          <step.icon className="h-3.5 w-3.5" style={{ color: step.color }} />
                        </div>
                        <p className="text-[10px] font-medium text-[var(--muted-foreground)]">{step.label}</p>
                        <p className="text-xs text-[var(--card-foreground)]">
                          {new Date(step.date!).toLocaleDateString()}
                        </p>
                      </div>
                      {i < arr.length - 1 && (
                        <div className="h-0.5 flex-1 bg-[var(--border)] mx-1" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contact & Team Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Contact Info" icon={User} accent="#48cae1">
                <div className="space-y-0">
                  <InfoItem icon={User} label="Customer" value={ticket.partner_name} />
                  <InfoItem icon={Mail} label="Email" value={ticket.partner_email} />
                </div>
              </SectionCard>

              <SectionCard title="Assignment" icon={Shield} accent="#9b51e0">
                <div className="space-y-0">
                  <InfoItem icon={Shield} label="Team" value={ticket.team_name} />
                  <InfoItem icon={Tag} label="Stage" value={ticket.stage_name} />
                  <InfoItem icon={Tag} label="Kanban State" value={ticket.kanban_state} />
                  <InfoItem icon={Calendar} label="Last Stage Update" value={ticket.create_date ? new Date(ticket.create_date).toLocaleDateString() : null} />
                </div>
              </SectionCard>
            </div>

            {/* Description */}
            {ticket.description && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
                <h3 className="text-sm font-heading font-bold text-[var(--muted-foreground)] mb-3">Description</h3>
                <div
                  className="text-sm text-[var(--card-foreground)] prose prose-sm max-w-none
                    [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5
                    [&_a]:text-primary [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: ticket.description }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </PermissionGate>
  )
}
