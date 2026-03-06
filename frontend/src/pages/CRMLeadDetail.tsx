import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, User, Mail, Phone, Calendar, DollarSign, TrendingUp,
  MapPin, Target, Trophy, Percent, Clock,
} from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { useLeadDetail } from '@/api/hooks'
import { formatCurrency } from '@/lib/utils'

function InfoItem({ icon: Icon, label, value, href }: { icon: typeof Mail; label: string; value: string | null | undefined; href?: string }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 mt-0.5 text-[var(--muted-foreground)]" />
      <div>
        <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{value}</a>
        ) : (
          <p className="text-sm text-[var(--card-foreground)]">{value}</p>
        )}
      </div>
    </div>
  )
}

function ProgressBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
        <span className="text-xs font-bold font-heading text-[var(--card-foreground)]">{percent}%</span>
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
  title: string; icon: typeof DollarSign; children: React.ReactNode; accent?: string
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
  '3': { label: 'Very High', color: '#ef4444' },
}

export function CRMLeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const leadId = id ? Number(id) : null
  const { data, isLoading } = useLeadDetail(leadId)

  const lead = data?.lead
  const priority = PRIORITY_MAP[lead?.priority ?? '0'] ?? PRIORITY_MAP['0']
  const probability = lead?.probability ?? 0

  return (
    <PermissionGate resource="crm.lead_table">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <button
          onClick={() => navigate('/crm')}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to CRM
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !lead ? (
          <div className="text-center py-20 text-[var(--muted-foreground)]">Lead not found</div>
        ) : (
          <>
            {/* Header with accent bar */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: lead.is_won ? '#00d084' : '#0693e3' }} />
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-heading font-bold text-[var(--card-foreground)]">{lead.name}</h1>
                    {lead.stage_name && <StatusBadge status={lead.stage_name} />}
                    {lead.is_won && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full"
                        style={{ color: '#00d084', backgroundColor: 'color-mix(in srgb, #00d084 12%, transparent)' }}
                      >
                        <Trophy className="h-3 w-3" /> Won
                      </span>
                    )}
                    <span
                      className="px-2.5 py-0.5 text-xs font-medium rounded-full"
                      style={{ color: priority.color, backgroundColor: `color-mix(in srgb, ${priority.color} 12%, transparent)` }}
                    >
                      {priority.label}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)] mt-1 capitalize">{lead.type || 'lead'}</p>
                  {lead.create_date && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      Created {new Date(lead.create_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-3xl font-heading font-bold text-[var(--card-foreground)]">
                    {formatCurrency(lead.expected_revenue)}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">Expected Revenue</p>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard title="Expected Revenue" value={formatCurrency(lead.expected_revenue)} icon={DollarSign} accent="#00d084" />
              <KpiCard title="Prorated Revenue" value={formatCurrency(lead.prorated_revenue)} icon={DollarSign} accent="#48cae1" />
              <KpiCard title="Probability" value={`${probability}%`} icon={Percent} accent="#9b51e0" />
              <KpiCard title="Status" value={lead.active ? (lead.is_won ? 'Won' : 'Active') : 'Archived'} icon={Target} accent={lead.is_won ? '#00d084' : '#0693e3'} />
            </div>

            {/* Probability Progress */}
            {probability > 0 && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <h3 className="text-sm font-heading font-bold text-[var(--card-foreground)] mb-4">
                  Win Probability
                </h3>
                <ProgressBar label="Conversion Likelihood" percent={probability} color={lead.is_won ? '#00d084' : '#0693e3'} />
              </div>
            )}

            {/* Contact & Timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Contact Info" icon={User} accent="#48cae1">
                <div className="space-y-0">
                  <InfoItem icon={User} label="Contact" value={lead.partner_name} />
                  <InfoItem icon={Mail} label="Email" value={lead.email_from} href={lead.email_from ? `mailto:${lead.email_from}` : undefined} />
                  <InfoItem icon={Phone} label="Phone" value={lead.phone} />
                  <InfoItem icon={MapPin} label="City" value={lead.city} />
                </div>
              </SectionCard>

              <SectionCard title="Key Dates" icon={Calendar} accent="#9b51e0">
                <div className="space-y-0">
                  <InfoItem icon={Calendar} label="Created" value={lead.create_date ? new Date(lead.create_date).toLocaleDateString() : null} />
                  <InfoItem icon={Clock} label="Opened" value={lead.date_open ? new Date(lead.date_open).toLocaleDateString() : null} />
                  <InfoItem icon={Calendar} label="Deadline" value={lead.date_deadline ? new Date(lead.date_deadline).toLocaleDateString() : null} />
                  <InfoItem icon={TrendingUp} label="Converted" value={lead.date_conversion ? new Date(lead.date_conversion).toLocaleDateString() : null} />
                  <InfoItem icon={Target} label="Closed" value={lead.date_closed ? new Date(lead.date_closed).toLocaleDateString() : null} />
                </div>
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </PermissionGate>
  )
}
