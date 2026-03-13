import { useParams, useNavigate, Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import {
  ArrowLeft, User, Mail, Phone, Calendar, DollarSign, TrendingUp,
  FileText, Truck, MapPin, Receipt, CheckCircle2, Clock,
  Percent, CreditCard, Globe, Hash,
} from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { DataTable } from '@/components/tables/DataTable'
import { useSalesOrderDetail } from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'

interface LineRow {
  id: number; product_name: string | null; internal_ref: string | null
  description: string | null; qty_ordered: number; qty_delivered: number
  qty_invoiced: number; price_unit: number; discount: number
  subtotal: number; total: number; margin: number
}

const lineColumns: ColumnDef<LineRow, unknown>[] = [
  { accessorKey: 'product_name', header: 'Product', cell: ({ getValue }) => getValue() as string || '-' },
  { accessorKey: 'internal_ref', header: 'Ref', cell: ({ getValue }) => <span className="text-primary font-normal">{(getValue() as string) || '-'}</span> },
  { accessorKey: 'qty_ordered', header: 'Qty', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'qty_delivered', header: 'Delivered', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'qty_invoiced', header: 'Invoiced', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'price_unit', header: 'Unit Price', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'discount', header: 'Disc %', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? `${v}%` : '-' } },
  { accessorKey: 'subtotal', header: 'Subtotal', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'margin', header: 'Margin', cell: ({ getValue }) => { const v = getValue() as number; return <span className={v < 0 ? 'text-danger' : ''}>{formatCurrency(v)}</span> } },
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

const DELIVERY_STATE_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#94a3b8' },
  waiting: { label: 'Waiting', color: '#fcb900' },
  confirmed: { label: 'Confirmed', color: '#0693e3' },
  assigned: { label: 'Ready', color: '#48cae1' },
  done: { label: 'Done', color: '#00d084' },
  cancel: { label: 'Cancelled', color: '#ef4444' },
}

const PAYMENT_STATE_MAP: Record<string, { label: string; color: string }> = {
  not_paid: { label: 'Not Paid', color: '#ef4444' },
  in_payment: { label: 'In Payment', color: '#fcb900' },
  paid: { label: 'Paid', color: '#00d084' },
  partial: { label: 'Partial', color: '#ff6900' },
  reversed: { label: 'Reversed', color: '#94a3b8' },
}

export function SalesOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const orderId = id ? Number(id) : null

  const { data, isLoading } = useSalesOrderDetail(orderId)

  const order = data?.order
  const customer = data?.customer
  const lines = data?.lines ?? []
  const invoices = data?.invoices ?? []
  const deliveries = data?.deliveries ?? []
  const fulfillment = data?.fulfillment

  return (
    <PermissionGate resource="sales.order_table">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/sales')}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Sales
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !order ? (
          <div className="text-center py-20 text-[var(--muted-foreground)]">Order not found</div>
        ) : (
          <>
            {/* Order header card */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-heading font-bold text-[var(--card-foreground)]">
                      {order.name}
                    </h1>
                    <StatusBadge status={order.state} />
                    <StatusBadge status={order.invoice_status || 'draft'} />
                  </div>
                  {customer?.name && (
                    <Link
                      to={`/customers/${customer.id}`}
                      className="text-primary hover:underline text-sm mt-1 inline-block"
                    >
                      {customer.name}
                    </Link>
                  )}
                  {order.create_date && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      Created {new Date(order.create_date).toLocaleDateString()}
                      {order.write_date && ` · Last updated ${new Date(order.write_date).toLocaleDateString()}`}
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

            {/* Financial KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <KpiCard title="Untaxed" value={formatCurrency(order.amount_untaxed)} icon={DollarSign} accent="#48cae1" tooltip={{ title: 'Untaxed Amount', formula: 'SUM(price_subtotal)\nFROM sale.order.line\nfor this order (before tax)', source: 'sale_order → amount_untaxed' }} />
              <KpiCard title="Tax" value={formatCurrency(order.amount_tax)} icon={Receipt} accent="#fcb900" tooltip={{ title: 'Tax Amount', formula: 'Total − Untaxed\n(amount_total − amount_untaxed)', source: 'sale_order → amount_tax' }} />
              <KpiCard title="Total" value={formatCurrency(order.amount_total)} icon={DollarSign} accent="#00d084" tooltip={{ title: 'Order Total', formula: 'Untaxed + Tax\n(amount_untaxed + amount_tax)', source: 'sale_order → amount_total' }} />
              <KpiCard title="Margin" value={formatCurrency(order.margin)} icon={TrendingUp} accent="#9b51e0" tooltip={{ title: 'Margin', formula: 'Revenue − Cost\nSUM(price_subtotal − product_cost × qty)\nacross all order lines', source: 'sale_order → margin' }} />
              <KpiCard title="Margin %" value={`${order.margin_percent}%`} icon={Percent} accent="#f78da7" tooltip={{ title: 'Margin %', formula: '(Margin / Untaxed) × 100\nIf untaxed = 0, shows 0%', source: 'sale_order → margin / amount_untaxed' }} />
            </div>

            {/* Fulfillment progress */}
            {fulfillment && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <h3 className="text-sm font-heading font-bold text-[var(--card-foreground)] mb-4">
                  Order Fulfillment
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <ProgressBar label="Delivery Progress" percent={fulfillment.delivery_percent} color="#48cae1" />
                  <ProgressBar label="Invoicing Progress" percent={fulfillment.invoice_percent} color="#00d084" />
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[var(--border)]">
                  <div className="text-center">
                    <p className="text-lg font-heading font-bold text-[var(--card-foreground)]">{formatNumber(fulfillment.total_ordered)}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">Ordered</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-heading font-bold text-[var(--card-foreground)]">{formatNumber(fulfillment.total_delivered)}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">Delivered</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-heading font-bold text-[var(--card-foreground)]">{formatNumber(fulfillment.total_invoiced)}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">Invoiced</p>
                  </div>
                </div>
              </div>
            )}

            {/* Customer & Address cards side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <SectionCard title="Customer Info" icon={User} accent="#48cae1">
                <div className="space-y-0">
                  <InfoItem icon={User} label="Customer" value={customer?.name} />
                  <InfoItem icon={Mail} label="Email" value={customer?.email} href={customer?.email ? `mailto:${customer.email}` : undefined} />
                  <InfoItem icon={Phone} label="Phone" value={customer?.phone} />
                  {customer?.mobile && customer.mobile !== customer.phone && (
                    <InfoItem icon={Phone} label="Mobile" value={customer.mobile} />
                  )}
                  <InfoItem icon={Hash} label="VAT" value={customer?.vat} />
                  <InfoItem icon={Globe} label="Website" value={customer?.website} href={customer?.website ? (customer.website.startsWith('http') ? customer.website : `https://${customer.website}`) : undefined} />
                </div>
              </SectionCard>

              <SectionCard title="Shipping Address" icon={Truck} accent="#00d084">
                {data?.shipping_address ? (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 mt-0.5 text-[var(--muted-foreground)]" />
                    <p className="text-sm text-[var(--card-foreground)]">{data.shipping_address}</p>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">No shipping address</p>
                )}
                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                  <InfoItem icon={Calendar} label="Order Date" value={order.date_order ? new Date(order.date_order).toLocaleDateString() : null} />
                  <InfoItem icon={Calendar} label="Delivery Date" value={order.commitment_date ? new Date(order.commitment_date).toLocaleDateString() : null} />
                </div>
              </SectionCard>

              <SectionCard title="Invoice Address" icon={FileText} accent="#9b51e0">
                {data?.invoice_address ? (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 mt-0.5 text-[var(--muted-foreground)]" />
                    <p className="text-sm text-[var(--card-foreground)]">{data.invoice_address}</p>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">No invoice address</p>
                )}
                {customer?.street && (
                  <div className="mt-4 pt-3 border-t border-[var(--border)]">
                    <InfoItem icon={MapPin} label="Customer Address" value={[customer.street, customer.city, customer.zip].filter(Boolean).join(', ')} />
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Order lines */}
            <div>
              <h2 className="text-xl font-heading font-bold text-[var(--foreground)] mb-4">
                Order Lines ({lines.length})
              </h2>
              <DataTable
                data={lines}
                columns={lineColumns}
              />
            </div>

            {/* Deliveries & Invoices side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Deliveries */}
              <SectionCard title={`Deliveries (${deliveries.length})`} icon={Truck} accent="#48cae1">
                {deliveries.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">No deliveries yet</p>
                ) : (
                  <div className="space-y-3">
                    {deliveries.map(d => {
                      const info = DELIVERY_STATE_MAP[d.state] ?? { label: d.state, color: '#94a3b8' }
                      return (
                        <div key={d.id} className="flex items-center justify-between rounded-lg px-3 py-2.5 border border-[var(--border)]">
                          <div className="flex items-center gap-3">
                            {d.state === 'done' ? (
                              <CheckCircle2 className="h-4 w-4" style={{ color: info.color }} />
                            ) : (
                              <Clock className="h-4 w-4" style={{ color: info.color }} />
                            )}
                            <div>
                              <p className="text-sm font-medium text-[var(--card-foreground)]">{d.name}</p>
                              <p className="text-xs text-[var(--muted-foreground)]">
                                {d.date_done
                                  ? `Completed ${new Date(d.date_done).toLocaleDateString()}`
                                  : d.scheduled_date
                                    ? `Scheduled ${new Date(d.scheduled_date).toLocaleDateString()}`
                                    : 'No date'}
                              </p>
                            </div>
                          </div>
                          <span
                            className="text-xs font-medium px-2.5 py-1 rounded-full"
                            style={{ color: info.color, backgroundColor: `color-mix(in srgb, ${info.color} 12%, transparent)` }}
                          >
                            {info.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </SectionCard>

              {/* Invoices */}
              <SectionCard title={`Invoices (${invoices.length})`} icon={CreditCard} accent="#00d084">
                {invoices.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">No invoices yet</p>
                ) : (
                  <div className="space-y-3">
                    {invoices.map(inv => {
                      const payInfo = PAYMENT_STATE_MAP[inv.payment_state ?? ''] ?? { label: inv.payment_state ?? inv.state, color: '#94a3b8' }
                      return (
                        <div key={inv.id} className="flex items-center justify-between rounded-lg px-3 py-2.5 border border-[var(--border)]">
                          <div className="flex items-center gap-3">
                            {inv.payment_state === 'paid' ? (
                              <CheckCircle2 className="h-4 w-4" style={{ color: payInfo.color }} />
                            ) : (
                              <FileText className="h-4 w-4" style={{ color: payInfo.color }} />
                            )}
                            <div>
                              <p className="text-sm font-medium text-[var(--card-foreground)]">
                                {inv.name}
                                {inv.type === 'credit_note' && (
                                  <span className="text-xs text-[var(--muted-foreground)] ml-1">(Credit Note)</span>
                                )}
                              </p>
                              <p className="text-xs text-[var(--muted-foreground)]">
                                {inv.date ? new Date(inv.date).toLocaleDateString() : 'No date'}
                                {' · '}{formatCurrency(inv.amount_total)}
                                {inv.amount_due > 0 && ` · ${formatCurrency(inv.amount_due)} due`}
                              </p>
                            </div>
                          </div>
                          <span
                            className="text-xs font-medium px-2.5 py-1 rounded-full"
                            style={{ color: payInfo.color, backgroundColor: `color-mix(in srgb, ${payInfo.color} 12%, transparent)` }}
                          >
                            {payInfo.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Notes - render HTML properly */}
            {order.note && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
                <h3 className="text-sm font-heading font-bold text-[var(--muted-foreground)] mb-3">Notes</h3>
                <div
                  className="text-sm text-[var(--card-foreground)] prose prose-sm max-w-none
                    [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5
                    [&_a]:text-primary [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: order.note }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </PermissionGate>
  )
}
