import { useCurrentUser, useMyPermissions } from '@/api/hooks'
import type { UserPermissions } from '@/lib/permissions'

export function useAuth() {
  const { data: user, isLoading: userLoading, error: userError } = useCurrentUser()
  const { data: permissions } = useMyPermissions()

  const isAuthenticated = !!user && !userError
  const isLoading = userLoading

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    window.location.href = '/login'
  }

  return {
    user,
    permissions: permissions as UserPermissions | null,
    isAuthenticated,
    isLoading,
    logout,
  }
}
