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
  '/sales': 'sales.revenue_chart',
  '/procurement': 'procurement.orders_chart',
  '/accounting': 'accounting.pl_statement',
  '/inventory': 'inventory.stock_levels',
  '/manufacturing': 'manufacturing.summary',
  '/helpdesk': 'helpdesk.summary',
  '/crm': 'crm.summary',
  '/projects': 'projects.summary',
  '/customers': 'customers.summary',
  '/alerts': 'alerts.view',
  '/report-builder': 'reports.builder',
  '/settings': 'settings.users',
}
