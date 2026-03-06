import type { ReactNode } from 'react'
import { usePermission } from '@/hooks/usePermission'
import type { PermissionAction } from '@/lib/permissions'

interface PermissionGateProps {
  resource: string
  action?: PermissionAction
  children: ReactNode
  fallback?: ReactNode
}

export function PermissionGate({ resource, action = 'view', children, fallback = null }: PermissionGateProps) {
  const allowed = usePermission(resource, action)
  return allowed ? <>{children}</> : <>{fallback}</>
}
