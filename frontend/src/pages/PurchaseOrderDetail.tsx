import { useParams, useNavigate, Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import {
  ArrowLeft, User, Mail, Phone, Calendar, DollarSign, FileText,
  Package, Truck, Receipt, CheckCircle2, Clock,
} from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { DataTable } from '@/components/tables/DataTable'
import { usePurchaseOrderDetail } from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'

interface LineRow {
  id: number; product_name: string | null; internal_ref: string | null
  description: string | null; product_qty: number; qty_received: number
  qty_invoiced: number; price_unit: number; price_subtotal: number
  price_tax: number; price_total: number; date_planned: string | null
}

const lineColumns: ColumnDef<LineRow, unknown>[] = [
  { accessorKey: 'product_name', header: 'Product', cell: ({ getValue }) => getValue() as string || '-' },
  { accessorKey: 'internal_ref', header: 'Ref', cell: ({ getValue }) => <span className="text-primary font-normal">{(getValue() as string) || '-'}</span> },
  { accessorKey: 'product_qty', header: 'Qty', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'qty_received', header: 'Received', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'qty_invoiced', header: 'Invoiced', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'price_unit', header: 'Unit Price', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'price_subtotal', header: 'Subtotal', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'price_total', header: 'Total', cell: ({ getValue }) => formatCurrency(getValue() as number) },
]

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

const PO_STATE_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#94a3b8' },
  sent: { label: 'Sent', color: '#0693e3' },
  to_approve: { label: 'To Approve', color: '#fcb900' },
  purchase: { label: 'Confirmed', color: '#00d084' },
  done: { label: 'Done', color: '#48cae1' },
  cancel: { label: 'Cancelled', color: '#ef4444' },
}

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const orderId = id ? Number(id) : null
  const { data, isLoading } = usePurchaseOrderDetail(orderId)

  const order = data?.order
  const vendor = data?.vendor
  const lines = (data?.lines ?? []) as LineRow[]

  // Compute fulfillment from line items
  const totalOrdered = lines.reduce((s, l) => s + l.product_qty, 0)
  const totalReceived = lines.reduce((s, l) => s + l.qty_received, 0)
  const totalInvoiced = lines.reduce((s, l) => s + l.qty_invoiced, 0)
  const receiptPct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0
  const invoicePct = totalOrdered > 0 ? Math.round((totalInvoiced / totalOrdered) * 100) : 0

  return (
    <PermissionGate resource="procurement.order_table">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <button
          onClick={() => navigate('/procurement')}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Procurement
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !order ? (
          <div className="text-center py-20 text-[var(--muted-foreground)]">Purchase order not found</div>
        ) : (
          <>
            {/* Header card with accent bar */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: '#0693e3' }} />
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-heading font-bold text-[var(--card-foreground)]">{order.name}</h1>
                    <StatusBadge status={order.state} />
                    {order.invoice_status && <StatusBadge status={order.invoice_status} />}
                  </div>
                  {vendor?.name && (
                    <Link to={`/customers/${vendor.id}`} className="text-primary hover:underline text-sm mt-1 inline-block">
                      {vendor.name}
                    </Link>
                  )}
                  {order.create_date && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      Created {new Date(order.create_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-3xl font-heading font-bold text-[var(--card-foreground)]">
                    {formatCurrency(order.amount_total)}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">Order Total</p>
                </div>
              </div>
            </div>

            {/* Financial KPIs with accent colors */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard title="Untaxed" value={formatCurrency(order.amount_untaxed)} icon={DollarSign} accent="#48cae1" />
              <KpiCard title="Tax" value={formatCurrency(order.amount_tax)} icon={Receipt} accent="#fcb900" />
              <KpiCard title="Total" value={formatCurrency(order.amount_total)} icon={DollarSign} accent="#00d084" />
            </div>

            {/* Fulfillment progress */}
            {totalOrdered > 0 && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <h3 className="text-sm font-heading font-bold text-[var(--card-foreground)] mb-4">
                  Order Fulfillment
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <ProgressBar label="Receipt Progress" percent={receiptPct} color="#48cae1" />
                  <ProgressBar label="Invoicing Progress" percent={invoicePct} color="#00d084" />
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[var(--border)]">
                  <div className="text-center">
                    <p className="text-lg font-heading font-bold text-[var(--card-foreground)]">{formatNumber(totalOrdered)}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">Ordered</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-heading font-bold text-[var(--card-foreground)]">{formatNumber(totalReceived)}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">Received</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-heading font-bold text-[var(--card-foreground)]">{formatNumber(totalInvoiced)}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">Invoiced</p>
                  </div>
                </div>
              </div>
            )}

            {/* Vendor Info & Dates side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Vendor Info" icon={User} accent="#0693e3">
                <div className="space-y-0">
                  <InfoItem icon={User} label="Vendor" value={vendor?.name} />
                  <InfoItem icon={Mail} label="Email" value={vendor?.email} href={vendor?.email ? `mailto:${vendor.email}` : undefined} />
                  <InfoItem icon={Phone} label="Phone" value={vendor?.phone} />
                </div>
              </SectionCard>

              <SectionCard title="Key Dates" icon={Calendar} accent="#9b51e0">
                <div className="space-y-0">
                  <InfoItem icon={Calendar} label="Order Date" value={order.date_order ? new Date(order.date_order).toLocaleDateString() : null} />
                  <InfoItem icon={CheckCircle2} label="Approved" value={order.date_approve ? new Date(order.date_approve).toLocaleDateString() : null} />
                  <InfoItem icon={Truck} label="Expected Arrival" value={order.date_planned ? new Date(order.date_planned).toLocaleDateString() : null} />
                  <InfoItem icon={Clock} label="Created" value={order.create_date ? new Date(order.create_date).toLocaleDateString() : null} />
                </div>
              </SectionCard>
            </div>

            {/* Order lines */}
            <div>
              <h2 className="text-xl font-heading font-bold text-[var(--foreground)] mb-4">
                Order Lines ({lines.length})
              </h2>
              <DataTable data={lines} columns={lineColumns} />
            </div>

            {/* Notes */}
            {order.notes && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
                <h3 className="text-sm font-heading font-bold text-[var(--muted-foreground)] mb-3">Notes</h3>
                <div
                  className="text-sm text-[var(--card-foreground)] prose prose-sm max-w-none
                    [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5
                    [&_a]:text-primary [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: order.notes }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </PermissionGate>
  )
}
