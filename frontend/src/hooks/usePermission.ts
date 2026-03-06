import { useMyPermissions } from '@/api/hooks'
import { hasPermission, type PermissionAction } from '@/lib/permissions'

export function usePermission(resource: string, action: PermissionAction = 'view'): boolean {
  const { data } = useMyPermissions()
  if (!data) return false
  return hasPermission(data, resource, action)
}
