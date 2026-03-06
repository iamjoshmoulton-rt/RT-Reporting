import { DollarSign, ShoppingCart, TrendingUp, Package, Headphones, Target, Factory, ListChecks, Receipt, CreditCard, ShoppingBag, FileText } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { RevenueChart } from '@/components/charts/RevenueChart'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { ComparisonChart } from '@/components/charts/ComparisonChart'
import {
  useDashboardSummary, useRevenueTrend, useTopCustomers, useTopProducts,
  useTicketsByPeriod, usePipelineByStage, useProductionByPeriod,
} from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { getWidgetCatalogEntry } from './widgetCatalog'

interface DashboardWidgetProps {
  widgetType: string
  dateFrom?: string
  dateTo?: string
}

export function DashboardWidget({ widgetType, dateFrom, dateTo }: DashboardWidgetProps) {
  const entry = getWidgetCatalogEntry(widgetType)
  const params = { date_from: dateFrom, date_to: dateTo }

  const { data: summary } = useDashboardSummary(params)
  const { data: revenueTrend } = useRevenueTrend(params)
  const { data: topCustomers } = useTopCustomers({ ...params, limit: 10 })
  const { data: topProducts } = useTopProducts({ ...params, limit: 10 })
  const { data: ticketsByPeriod } = useTicketsByPeriod({ ...params, group_by: 'month' })
  const { data: pipelineByStage } = usePipelineByStage()
  const { data: productionByPeriod } = useProductionByPeriod({ ...params, group_by: 'month' })

  if (!entry) return null

  const content = (() => {
    switch (widgetType) {
      case 'kpi_revenue':
        return (
          <KpiCard
            title="Total Revenue"
            value={formatCurrency(summary?.sales.total_revenue ?? 0)}
            subtitle={`${formatNumber(summary?.sales.total_orders ?? 0)} orders`}
            icon={DollarSign}
            accent="#48cae1"
            trend={summary?.trends?.total_revenue ?? undefined}
            trendLabel="vs prev period"
          />
        )
      case 'kpi_orders':
        return (
          <KpiCard
            title="Avg Order Value"
            value={formatCurrency(summary?.sales.avg_order_value ?? 0)}
            icon={ShoppingCart}
            accent="#00d084"
            trend={summary?.trends?.avg_order_value ?? undefined}
            trendLabel="vs prev period"
          />
        )
      case 'kpi_gross_margin':
        return (
          <KpiCard
            title="Net Revenue"
            value={formatCurrency(summary?.accounting.net_revenue ?? 0)}
            subtitle={`${formatCurrency(summary?.accounting.invoices.outstanding ?? 0)} outstanding`}
            icon={TrendingUp}
            accent="#9b51e0"
            trend={summary?.trends?.net_revenue ?? undefined}
            trendLabel="vs prev period"
          />
        )
      case 'kpi_receivables':
        return (
          <KpiCard
            title="Inventory"
            value={formatNumber(summary?.inventory.available_quantity ?? 0)}
            subtitle={`${formatNumber(summary?.inventory.unique_products ?? 0)} products`}
            icon={Package}
            accent="#fcb900"
          />
        )
      case 'kpi_helpdesk':
        return (
          <KpiCard
            title="Open Tickets"
            value={formatNumber(summary?.helpdesk?.open_tickets ?? 0)}
            subtitle={`${summary?.helpdesk?.avg_resolution_days ?? 0}d avg resolution`}
            icon={Headphones}
            accent="#ff6900"
            trend={summary?.trends?.open_tickets ?? undefined}
            trendLabel="vs prev period"
          />
        )
      case 'kpi_crm':
        return (
          <KpiCard
            title="Pipeline Value"
            value={formatCurrency(summary?.crm?.pipeline_value ?? 0)}
            subtitle={`${formatNumber(summary?.crm?.open_leads ?? 0)} open leads`}
            icon={Target}
            accent="#0693e3"
            trend={summary?.trends?.pipeline_value ?? undefined}
            trendLabel="vs prev period"
          />
        )
      case 'kpi_manufacturing':
        return (
          <KpiCard
            title="Active MOs"
            value={formatNumber(summary?.manufacturing?.active_mos ?? 0)}
            subtitle={`${formatNumber(summary?.manufacturing?.units_produced ?? 0)} units produced`}
            icon={Factory}
            accent="#f78da7"
            trend={summary?.trends?.active_mos ?? undefined}
            trendLabel="vs prev period"
          />
        )
      case 'kpi_projects':
        return (
          <KpiCard
            title="Open Tasks"
            value={formatNumber(summary?.projects?.open_tasks ?? 0)}
            subtitle={`${formatNumber(summary?.projects?.overdue_tasks ?? 0)} overdue`}
            icon={ListChecks}
            accent="#00d084"
            trend={summary?.trends?.open_tasks ?? undefined}
            trendLabel="vs prev period"
          />
        )
      case 'revenue_chart':
        return revenueTrend ? <RevenueChart data={revenueTrend} /> : null
      case 'top_customers':
        return topCustomers ? (
          <TopItemsChart
            title="Top Customers"
            data={topCustomers.map(c => ({ name: c.customer_name, value: c.total_revenue }))}
          />
        ) : null
      case 'top_products':
        return topProducts ? (
          <TopItemsChart
            title="Top Products"
            type="pie"
            data={topProducts.map(p => ({ name: p.product_name, value: p.total_revenue }))}
          />
        ) : null
      case 'helpdesk_chart':
        return ticketsByPeriod ? (
          <ComparisonChart
            title="Tickets by Period"
            currentData={ticketsByPeriod.current.map(d => ({ period: d.period, value: d.ticket_count }))}
            valueLabel="Tickets"
          />
        ) : null
      case 'crm_pipeline_chart':
        return pipelineByStage ? (
          <TopItemsChart
            title="Pipeline by Stage"
            data={pipelineByStage.map((s: Record<string, unknown>) => ({ name: s.stage_name as string, value: s.expected_revenue as number }))}
          />
        ) : null
      case 'manufacturing_chart':
        return productionByPeriod ? (
          <ComparisonChart
            title="Production by Period"
            currentData={productionByPeriod.current.map(d => ({ period: d.period, value: d.mo_count }))}
            valueLabel="MOs Completed"
          />
        ) : null
      case 'quick_stats':
        return (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm h-full">
            <h3 className="text-[15px] font-heading font-bold text-[var(--card-foreground)] mb-4">
              Quick Stats
            </h3>
            <div className="space-y-1">
              <QuickStatRow
                icon={ShoppingBag}
                label="Purchase Orders"
                value={formatNumber(summary?.procurement.total_orders ?? 0)}
                color="#48cae1"
              />
              <QuickStatRow
                icon={CreditCard}
                label="Total Procurement"
                value={formatCurrency(summary?.procurement.total_spend ?? 0)}
                color="#00d084"
              />
              <QuickStatRow
                icon={FileText}
                label="Outstanding Invoices"
                value={formatCurrency(summary?.accounting.invoices.outstanding ?? 0)}
                color="#fcb900"
              />
              <QuickStatRow
                icon={Receipt}
                label="Outstanding Bills"
                value={formatCurrency(summary?.accounting.bills.outstanding ?? 0)}
                color="#ff6900"
              />
            </div>
          </div>
        )
      default:
        return null
    }
  })()

  if (!content) return null

  return (
    <PermissionGate resource={entry.permission}>
      <div className="h-full min-h-0 overflow-hidden">{content}</div>
    </PermissionGate>
  )
}

/* ─── Quick Stats helper ─── */
function QuickStatRow({ icon: Icon, label, value, color }: {
  icon: typeof DollarSign
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-[var(--accent)]">
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <span className="flex-1 text-sm text-[var(--muted-foreground)]">{label}</span>
      <span className="text-sm font-heading font-bold text-[var(--card-foreground)] tabular-nums">
        {value}
      </span>
    </div>
  )
}
