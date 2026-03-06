import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { ArrowLeft, Mail, Phone, MapPin, Globe, Building2, User, ShoppingCart, DollarSign, TrendingUp } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { DataTable } from '@/components/tables/DataTable'
import { useCustomerDetail } from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'

interface OrderRow {
  id: number; name: string; state: string; date_order: string | null
  amount_total: number; amount_untaxed: number; invoice_status: string
}

const orderColumns: ColumnDef<OrderRow, unknown>[] = [
  { accessorKey: 'name', header: 'Order #', cell: ({ row, getValue }) => <Link to={`/sales/orders/${row.original.id}`} className="font-normal text-primary hover:underline">{getValue() as string}</Link> },
  { accessorKey: 'date_order', header: 'Date', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
  { accessorKey: 'amount_total', header: 'Total', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'amount_untaxed', header: 'Untaxed', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'state', header: 'Status', cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  { accessorKey: 'invoice_status', header: 'Invoice', cell: ({ getValue }) => <StatusBadge status={(getValue() as string) || 'draft'} /> },
]

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string | null | undefined }) {
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

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const customerId = id ? Number(id) : null
  const [page, setPage] = useState(0)
  const pageSize = 20

  const { data, isLoading } = useCustomerDetail(customerId, {
    offset: page * pageSize,
    limit: pageSize,
  })

  const customer = data?.customer
  const stats = data?.stats
  const orders = data?.orders

  const address = [customer?.street, customer?.street2, customer?.city, customer?.zip]
    .filter(Boolean)
    .join(', ')

  return (
    <PermissionGate resource="customers.customer_table">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/customers')}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Customers
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !customer ? (
          <div className="text-center py-20 text-[var(--muted-foreground)]">Customer not found</div>
        ) : (
          <>
            {/* Customer profile card */}
            <div className="rounded-xl border bg-[var(--card)] p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                  {customer.is_company
                    ? <Building2 className="h-7 w-7" />
                    : <User className="h-7 w-7" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-heading font-bold text-[var(--card-foreground)] truncate">
                    {customer.name}
                  </h1>
                  {customer.is_company && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-normal mt-1">
                      Company
                    </span>
                  )}
                  {customer.create_date && (
                    <p className="text-sm text-[var(--muted-foreground)] mt-1">
                      Customer since {new Date(customer.create_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1">
                <InfoRow icon={Mail} label="Email" value={customer.email} />
                <InfoRow icon={Phone} label="Phone" value={customer.phone} />
                <InfoRow icon={Phone} label="Mobile" value={customer.mobile} />
                <InfoRow icon={MapPin} label="Address" value={address || null} />
                <InfoRow icon={Globe} label="Website" value={customer.website} />
                <InfoRow icon={Building2} label="VAT" value={customer.vat} />
              </div>
            </div>

            {/* KPI stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard
                title="Total Orders"
                value={formatNumber(stats?.total_orders ?? 0)}
                icon={ShoppingCart}
              />
              <KpiCard
                title="Total Revenue"
                value={formatCurrency(stats?.total_revenue ?? 0)}
                icon={DollarSign}
              />
              <KpiCard
                title="Avg Order Value"
                value={formatCurrency(stats?.avg_order_value ?? 0)}
                icon={TrendingUp}
              />
            </div>

            {/* Order history table */}
            <div>
              <h2 className="text-xl font-heading font-bold text-[var(--foreground)] mb-4">Order History</h2>
              <DataTable
                data={(orders?.items ?? []) as unknown as OrderRow[]}
                columns={orderColumns}
                total={orders?.total}
                pageSize={pageSize}
                page={page}
                onPageChange={setPage}
                isLoading={isLoading}
                serverPagination
              />
            </div>
          </>
        )}
      </div>
    </PermissionGate>
  )
}
