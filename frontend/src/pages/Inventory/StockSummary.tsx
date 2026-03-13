import { Package, Warehouse, ArrowRightLeft, BoxesIcon } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { useInventorySummary, useStockByWarehouse } from '@/api/hooks'
import { formatNumber } from '@/lib/utils'

export function StockSummaryPage() {
  const { data: summary, isLoading: summaryLoading } = useInventorySummary()
  const { data: byWarehouse } = useStockByWarehouse()

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

      <PermissionGate resource="inventory.by_warehouse">
        {byWarehouse && byWarehouse.length > 0 && (
          <TopItemsChart
            title="Stock by Warehouse"
            data={byWarehouse.map(w => ({ name: w.warehouse_name, value: w.total_quantity }))}
          />
        )}
      </PermissionGate>
    </div>
  )
}
