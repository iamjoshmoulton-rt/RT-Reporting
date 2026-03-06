import { useParams, useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import {
  ArrowLeft, Calendar, Package, MapPin, AlertTriangle, Factory,
  Boxes, Clock, Hammer,
} from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { DataTable } from '@/components/tables/DataTable'
import { useManufacturingOrderDetail } from '@/api/hooks'
import { formatNumber } from '@/lib/utils'

interface ComponentRow {
  id: number; product_name: string | null; internal_ref: string | null; product_qty: number
}

const componentColumns: ColumnDef<ComponentRow, unknown>[] = [
  { accessorKey: 'product_name', header: 'Component', cell: ({ getValue }) => getValue() as string || '-' },
  { accessorKey: 'internal_ref', header: 'Ref', cell: ({ getValue }) => <span className="text-primary font-normal">{(getValue() as string) || '-'}</span> },
  { accessorKey: 'product_qty', header: 'Qty Required', cell: ({ getValue }) => formatNumber(getValue() as number) },
]

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
  title: string; icon: typeof Factory; children: React.ReactNode; accent?: string
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

const priorityLabel = (p: string | null) => {
  if (p === '1') return 'Urgent'
  if (p === '0') return 'Normal'
  return p || 'Normal'
}

const MO_STATE_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#94a3b8' },
  confirmed: { label: 'Confirmed', color: '#0693e3' },
  progress: { label: 'In Progress', color: '#fcb900' },
  to_close: { label: 'To Close', color: '#48cae1' },
  done: { label: 'Done', color: '#00d084' },
  cancel: { label: 'Cancelled', color: '#ef4444' },
}

export function ManufacturingOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const orderId = id ? Number(id) : null
  const { data, isLoading } = useManufacturingOrderDetail(orderId)

  const order = data?.order
  const components = (data?.components ?? []) as ComponentRow[]
  const progressPct = order && order.product_qty > 0
    ? Math.round((order.qty_producing / order.product_qty) * 100)
    : 0

  return (
    <PermissionGate resource="manufacturing.order_table">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <button
          onClick={() => navigate('/manufacturing')}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Manufacturing
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !order ? (
          <div className="text-center py-20 text-[var(--muted-foreground)]">Manufacturing order not found</div>
        ) : (
          <>
            {/* Header with accent bar */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: '#ff6900' }} />
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-heading font-bold text-[var(--card-foreground)]">{order.name}</h1>
                    <StatusBadge status={order.state} />
                    {order.priority === '1' && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">Urgent</span>
                    )}
                  </div>
                  {order.product_name && (
                    <p className="text-sm text-[var(--muted-foreground)] mt-1">
                      {order.product_name}
                      {order.product_ref && <span className="text-primary ml-1">({order.product_ref})</span>}
                    </p>
                  )}
                  {order.create_date && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      Created {new Date(order.create_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-3xl font-heading font-bold text-[var(--card-foreground)]">
                    {formatNumber(order.product_qty)}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">Qty to Produce</p>
                </div>
              </div>
            </div>

            {/* KPIs with accent */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard title="Qty to Produce" value={formatNumber(order.product_qty)} icon={Package} accent="#ff6900" />
              <KpiCard title="Qty Producing" value={formatNumber(order.qty_producing)} icon={Factory} accent="#48cae1" />
              <KpiCard title="Progress" value={`${progressPct}%`} icon={Hammer} accent="#00d084" />
            </div>

            {/* Production progress */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h3 className="text-sm font-heading font-bold text-[var(--card-foreground)] mb-4">
                Production Progress
              </h3>
              <ProgressBar label="Manufacturing Completion" percent={progressPct} color="#ff6900" />
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-[var(--border)]">
                <div className="text-center">
                  <p className="text-lg font-heading font-bold text-[var(--card-foreground)]">{formatNumber(order.product_qty)}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Target Qty</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-heading font-bold text-[var(--card-foreground)]">{formatNumber(order.qty_producing)}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">In Production</p>
                </div>
              </div>
            </div>

            {/* Details & Locations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Order Details" icon={Boxes} accent="#ff6900">
                <div className="space-y-0">
                  <InfoItem icon={AlertTriangle} label="Priority" value={priorityLabel(order.priority)} />
                  <InfoItem icon={Package} label="Source Document" value={order.origin} />
                  <InfoItem icon={Calendar} label="Start Date" value={order.date_start ? new Date(order.date_start).toLocaleDateString() : null} />
                  <InfoItem icon={Calendar} label="Finished" value={order.date_finished ? new Date(order.date_finished).toLocaleDateString() : null} />
                  <InfoItem icon={Clock} label="Deadline" value={order.date_deadline ? new Date(order.date_deadline).toLocaleDateString() : null} />
                </div>
              </SectionCard>

              <SectionCard title="Locations" icon={MapPin} accent="#9b51e0">
                <div className="space-y-0">
                  <InfoItem icon={MapPin} label="Source Location" value={order.source_location} />
                  <InfoItem icon={MapPin} label="Destination" value={order.dest_location} />
                </div>
              </SectionCard>
            </div>

            {/* BOM Components */}
            {components.length > 0 && (
              <div>
                <h2 className="text-xl font-heading font-bold text-[var(--foreground)] mb-4">
                  BOM Components ({components.length})
                </h2>
                <DataTable data={components} columns={componentColumns} />
              </div>
            )}
          </>
        )}
      </div>
    </PermissionGate>
  )
}
