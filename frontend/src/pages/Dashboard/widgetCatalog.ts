import type { LayoutWidget } from '@/types/api'

export const WIDGET_TYPE_IDS = [
  'kpi_revenue',
  'kpi_orders',
  'kpi_gross_margin',
  'kpi_receivables',
  'kpi_helpdesk',
  'kpi_crm',
  'kpi_manufacturing',
  'kpi_projects',
  'revenue_chart',
  'top_customers',
  'top_products',
  'quick_stats',
  'helpdesk_chart',
  'crm_pipeline_chart',
  'manufacturing_chart',
] as const

export type WidgetTypeId = (typeof WIDGET_TYPE_IDS)[number]

export interface WidgetCatalogEntry {
  id: WidgetTypeId
  label: string
  defaultW: number
  defaultH: number
  permission: string
}

export const WIDGET_CATALOG: WidgetCatalogEntry[] = [
  { id: 'kpi_revenue', label: 'Total Revenue', defaultW: 3, defaultH: 1, permission: 'dashboard.kpi_revenue' },
  { id: 'kpi_orders', label: 'Avg Order Value', defaultW: 3, defaultH: 1, permission: 'dashboard.kpi_orders' },
  { id: 'kpi_gross_margin', label: 'Net Revenue', defaultW: 3, defaultH: 1, permission: 'dashboard.kpi_gross_margin' },
  { id: 'kpi_receivables', label: 'Inventory', defaultW: 3, defaultH: 1, permission: 'dashboard.kpi_receivables' },
  { id: 'kpi_helpdesk', label: 'Helpdesk', defaultW: 3, defaultH: 1, permission: 'dashboard.kpi_helpdesk' },
  { id: 'kpi_crm', label: 'CRM Pipeline', defaultW: 3, defaultH: 1, permission: 'dashboard.kpi_crm' },
  { id: 'kpi_manufacturing', label: 'Manufacturing', defaultW: 3, defaultH: 1, permission: 'dashboard.kpi_manufacturing' },
  { id: 'kpi_projects', label: 'Projects', defaultW: 3, defaultH: 1, permission: 'dashboard.kpi_projects' },
  { id: 'revenue_chart', label: 'Revenue Trend', defaultW: 6, defaultH: 3, permission: 'dashboard.revenue_chart' },
  { id: 'top_customers', label: 'Top Customers', defaultW: 6, defaultH: 3, permission: 'dashboard.top_customers' },
  { id: 'top_products', label: 'Top Products', defaultW: 6, defaultH: 3, permission: 'dashboard.top_products' },
  { id: 'quick_stats', label: 'Quick Stats', defaultW: 6, defaultH: 3, permission: 'dashboard.orders_chart' },
  { id: 'helpdesk_chart', label: 'Tickets by Period', defaultW: 6, defaultH: 3, permission: 'dashboard.helpdesk_chart' },
  { id: 'crm_pipeline_chart', label: 'CRM by Stage', defaultW: 6, defaultH: 3, permission: 'dashboard.crm_pipeline_chart' },
  { id: 'manufacturing_chart', label: 'Production Trend', defaultW: 6, defaultH: 3, permission: 'dashboard.manufacturing_chart' },
]

export function getWidgetCatalogEntry(widgetType: string): WidgetCatalogEntry | undefined {
  return WIDGET_CATALOG.find(e => e.id === widgetType)
}

/** Built-in default layout matching the original dashboard (4 KPIs, then 2 rows of 2 charts). Grid: 12 cols. */
export const DEFAULT_DASHBOARD_LAYOUT: LayoutWidget[] = [
  { i: 'kpi_revenue', x: 0, y: 0, w: 3, h: 1, widget_type: 'kpi_revenue', config: {} },
  { i: 'kpi_orders', x: 3, y: 0, w: 3, h: 1, widget_type: 'kpi_orders', config: {} },
  { i: 'kpi_gross_margin', x: 6, y: 0, w: 3, h: 1, widget_type: 'kpi_gross_margin', config: {} },
  { i: 'kpi_receivables', x: 9, y: 0, w: 3, h: 1, widget_type: 'kpi_receivables', config: {} },
  { i: 'revenue_chart', x: 0, y: 1, w: 6, h: 3, widget_type: 'revenue_chart', config: {} },
  { i: 'top_customers', x: 6, y: 1, w: 6, h: 3, widget_type: 'top_customers', config: {} },
  { i: 'top_products', x: 0, y: 4, w: 6, h: 3, widget_type: 'top_products', config: {} },
  { i: 'quick_stats', x: 6, y: 4, w: 6, h: 3, widget_type: 'quick_stats', config: {} },
]
