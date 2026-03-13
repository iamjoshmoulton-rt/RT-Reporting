import { useState } from 'react'
import { Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Package, Warehouse, ArrowRightLeft, BoxesIcon } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { DataTable } from '@/components/tables/DataTable'
import { useInventorySummary, useStockLevels } from '@/api/hooks'
import { formatNumber } from '@/lib/utils'
import { ExportMenu } from '@/components/ui/ExportMenu'

interface StockRow {
  product_id: number; product_name: string; internal_ref: string
  on_hand: number; reserved: number; available: number
}

function displayName(val: unknown): string {
  if (typeof val === 'string') return val
  if (val && typeof val === 'object') {
    const obj = val as Record<string, string>
    return obj.en_US ?? obj.en ?? Object.values(obj)[0] ?? '-'
  }
  return '-'
}

const stockColumns: ColumnDef<StockRow, unknown>[] = [
  { accessorKey: 'internal_ref', header: 'Ref', cell: ({ getValue }) => <span className="font-normal text-primary">{(getValue() as string) || '-'}</span> },
  { accessorKey: 'product_name', header: 'Product', cell: ({ row, getValue }) => <Link to={`/inventory/products/${row.original.product_id}`} className="text-primary hover:underline">{displayName(getValue())}</Link> },
  { accessorKey: 'on_hand', header: 'On Hand', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'reserved', header: 'Reserved', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-warning">{formatNumber(v)}</span> : '0' } },
  { accessorKey: 'available', header: 'Available', cell: ({ getValue }) => { const v = getValue() as number; return <span className={v <= 0 ? 'text-danger font-normal' : 'text-success'}>{formatNumber(v)}</span> } },
]

export function TotalStockedPage() {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const pageSize = 25

  const { data: summary, isLoading: summaryLoading } = useInventorySummary()
  const { data: stockData, isLoading } = useStockLevels({ offset: page * pageSize, limit: pageSize, search: search || undefined })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PermissionGate resource="inventory.stock_levels">
          <KpiCard title="Total On Hand" value={summary ? formatNumber(summary.total_quantity) : undefined} icon={Package} loading={summaryLoading}
            tooltip={{ title: 'Total On Hand', formula: 'SUM(quantity)\nFROM stock.quant\nWHERE location is internal stock', source: 'stock.quant' }} />
        </PermissionGate>
        <PermissionGate resource="inventory.stock_levels">
          <KpiCard title="Available" value={summary ? formatNumber(summary.available_quantity) : undefined} icon={BoxesIcon} loading={summaryLoading}
            tooltip={{ title: 'Available', formula: 'SUM(quantity - reserved_quantity)\nFROM stock.quant\nWHERE location is internal stock', source: 'stock.quant' }} />
        </PermissionGate>
        <PermissionGate resource="inventory.stock_levels">
          <KpiCard title="Reserved" value={summary ? formatNumber(summary.total_reserved) : undefined} icon={ArrowRightLeft} loading={summaryLoading}
            tooltip={{ title: 'Reserved', formula: 'SUM(reserved_quantity)\nFROM stock.quant\nWHERE location is internal stock', source: 'stock.quant' }} />
        </PermissionGate>
        <PermissionGate resource="inventory.stock_levels">
          <KpiCard title="Unique Products" value={summary ? formatNumber(summary.unique_products) : undefined} icon={Warehouse} loading={summaryLoading}
            tooltip={{ title: 'Unique Products', formula: 'COUNT(DISTINCT product_id)\nFROM stock.quant\nWHERE location is internal stock\n  AND quantity > 0', source: 'stock.quant' }} />
        </PermissionGate>
      </div>

      <PermissionGate resource="inventory.stock_levels">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-heading font-bold text-[var(--foreground)]">Stock Levels</h2>
          <ExportMenu module="inventory" />
        </div>
        <DataTable
          data={(stockData?.items ?? []) as unknown as StockRow[]}
          columns={stockColumns}
          total={stockData?.total}
          pageSize={pageSize}
          page={page}
          onPageChange={setPage}
          isLoading={isLoading}
          serverPagination
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(0) }}
          searchPlaceholder="Search products…"
        />
      </PermissionGate>
    </div>
  )
}
