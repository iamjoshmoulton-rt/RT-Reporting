export type PermissionAction = 'view' | 'export' | 'manage'

export interface PermissionEntry {
  resource: string
  action: PermissionAction
}

export interface UserPermissions {
  permissions: PermissionEntry[]
  is_superadmin: boolean
}

export function hasPermission(
  userPerms: UserPermissions | null,
  resource: string,
  action: PermissionAction = 'view'
): boolean {
  if (!userPerms) return false
  if (userPerms.is_superadmin) return true
  return userPerms.permissions.some(
    (p) => p.resource === resource && p.action === action
  )
}

export const NAV_PERMISSIONS: Record<string, string> = {
  '/dashboard': 'dashboard.kpi_revenue',
  '/sales-dashboard': 'sales.revenue_chart',
  '/procurement-dashboard': 'procurement.orders_chart',
  '/inventory': 'inventory.stock_levels',
  '/customers': 'customers.summary',
  '/ecommerce-invoice': 'ecommerce.invoice_view',
  '/ecommerce-order': 'ecommerce.order_view',
  '/pricing-history': 'pricing_history.view',
  '/alerts': 'alerts.view',
  '/report-builder': 'reports.builder',
  '/settings': 'settings.users',
}
