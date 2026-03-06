import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { ArrowLeft, Package, Warehouse, Tag, DollarSign, ArrowRightLeft, BoxesIcon } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { DataTable } from '@/components/tables/DataTable'
import { useProductDetail } from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'

interface LocationRow {
  location: string; on_hand: number; reserved: number; available: number
}

interface MoveRow {
  id: number; reference: string; quantity: number; date: string | null
  origin: string | null; source_location: string; dest_location: string
}

const locationColumns: ColumnDef<LocationRow, unknown>[] = [
  { accessorKey: 'location', header: 'Location' },
  { accessorKey: 'on_hand', header: 'On Hand', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'reserved', header: 'Reserved', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-warning">{formatNumber(v)}</span> : '0' } },
  { accessorKey: 'available', header: 'Available', cell: ({ getValue }) => { const v = getValue() as number; return <span className={v <= 0 ? 'text-danger font-normal' : 'text-success'}>{formatNumber(v)}</span> } },
]

const moveColumns: ColumnDef<MoveRow, unknown>[] = [
  { accessorKey: 'reference', header: 'Reference', cell: ({ getValue }) => <span className="font-normal text-primary">{(getValue() as string) || '-'}</span> },
  { accessorKey: 'date', header: 'Date', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
  { accessorKey: 'quantity', header: 'Qty', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'source_location', header: 'From' },
  { accessorKey: 'dest_location', header: 'To' },
  { accessorKey: 'origin', header: 'Source Doc', cell: ({ getValue }) => (getValue() as string) || '-' },
]

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const productId = id ? Number(id) : null
  const [page, setPage] = useState(0)
  const pageSize = 20

  const { data, isLoading } = useProductDetail(productId, {
    offset: page * pageSize,
    limit: pageSize,
  })

  const product = data?.product
  const stock = data?.stock
  const locations = data?.locations ?? []
  const movements = data?.movements

  return (
    <PermissionGate resource="inventory.stock_levels">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/inventory')}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Inventory
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !product ? (
          <div className="text-center py-20 text-[var(--muted-foreground)]">Product not found</div>
        ) : (
          <>
            {/* Product header */}
            <div className="rounded-xl border bg-[var(--card)] p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                  <Package className="h-7 w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-heading font-bold text-[var(--card-foreground)] truncate">
                    {product.name}
                  </h1>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {product.default_code && (
                      <span className="inline-flex items-center gap-1 text-sm text-primary">
                        <Tag className="h-3.5 w-3.5" />
                        {product.default_code}
                      </span>
                    )}
                    {product.type && (
                      <span className="inline-flex items-center rounded-full bg-[var(--muted)] px-2.5 py-0.5 text-xs text-[var(--muted-foreground)]">
                        {product.type === 'consu' ? 'Consumable' : product.type === 'service' ? 'Service' : 'Storable'}
                      </span>
                    )}
                    {!product.active && (
                      <span className="inline-flex items-center rounded-full bg-danger/10 text-danger px-2.5 py-0.5 text-xs font-normal">
                        Archived
                      </span>
                    )}
                  </div>
                  {product.create_date && (
                    <p className="text-sm text-[var(--muted-foreground)] mt-1">
                      Created {new Date(product.create_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 py-2">
                  <DollarSign className="h-4 w-4 text-[var(--muted-foreground)]" />
                  <div>
                    <p className="text-xs text-[var(--muted-foreground)]">Sales Price</p>
                    <p className="text-sm text-[var(--card-foreground)]">{formatCurrency(product.list_price)}</p>
                  </div>
                </div>


              </div>
            </div>

            {/* Stock KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard title="On Hand" value={formatNumber(stock?.on_hand ?? 0)} icon={Warehouse} />
              <KpiCard title="Reserved" value={formatNumber(stock?.reserved ?? 0)} icon={ArrowRightLeft} />
              <KpiCard title="Available" value={formatNumber(stock?.available ?? 0)} icon={BoxesIcon} />
            </div>

            {/* Stock by location */}
            {locations.length > 0 && (
              <div>
                <h2 className="text-xl font-heading font-bold text-[var(--foreground)] mb-4">
                  Stock by Location
                </h2>
                <DataTable
                  data={locations}
                  columns={locationColumns}
                />
              </div>
            )}

            {/* Recent movements */}
            <div>
              <h2 className="text-xl font-heading font-bold text-[var(--foreground)] mb-4">
                Recent Movements
              </h2>
              <DataTable
                data={(movements?.items ?? []) as unknown as MoveRow[]}
                columns={moveColumns}
                total={movements?.total}
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
