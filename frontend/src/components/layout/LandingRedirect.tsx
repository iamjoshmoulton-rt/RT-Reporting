import { Navigate } from 'react-router-dom'
import { useUserPreferences } from '@/api/hooks'

/**
 * Reads the user's landing_page preference and redirects there.
 * Falls back to /dashboard if no preference is set or still loading.
 */
export function LandingRedirect() {
  const { data: prefs, isLoading } = useUserPreferences()

  if (isLoading) return null // ProtectedRoute already shows a spinner

  const target = prefs?.landing_page || '/dashboard'
  return <Navigate to={target} replace />
}
