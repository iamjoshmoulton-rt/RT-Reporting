import { Package, Warehouse, ArrowRightLeft, BoxesIcon } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { useInventorySummary, useStockByWarehouse } from '@/api/hooks'
import { formatNumber } from '@/lib/utils'

export function StockSummaryPage() {
  const { data: summary } = useInventorySummary()
  const { data: byWarehouse } = useStockByWarehouse()

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PermissionGate resource="inventory.stock_levels">
          <KpiCard title="Total On Hand" value={formatNumber(summary?.total_quantity ?? 0)} icon={Package} />
        </PermissionGate>
        <PermissionGate resource="inventory.stock_levels">
          <KpiCard title="Available" value={formatNumber(summary?.available_quantity ?? 0)} icon={BoxesIcon} />
        </PermissionGate>
        <PermissionGate resource="inventory.stock_levels">
          <KpiCard title="Reserved" value={formatNumber(summary?.total_reserved ?? 0)} icon={ArrowRightLeft} />
        </PermissionGate>
        <PermissionGate resource="inventory.stock_levels">
          <KpiCard title="Unique Products" value={formatNumber(summary?.unique_products ?? 0)} icon={Warehouse} />
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
