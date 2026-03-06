import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const INTERVALS = [
  { label: 'Off', value: 0 },
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 },
  { label: '5m', value: 300000 },
  { label: '15m', value: 900000 },
]

export function useAutoRefresh() {
  const [interval, setInterval_] = useState(() => {
    const stored = localStorage.getItem('auto_refresh_interval')
    return stored ? parseInt(stored) : 0
  })
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const queryClient = useQueryClient()

  const refresh = useCallback(() => {
    queryClient.invalidateQueries()
    setLastRefresh(new Date())
  }, [queryClient])

  useEffect(() => {
    localStorage.setItem('auto_refresh_interval', String(interval))
    if (interval <= 0) return

    const id = window.setInterval(refresh, interval)
    return () => window.clearInterval(id)
  }, [interval, refresh])

  return {
    interval,
    setInterval: (v: number) => setInterval_(v),
    lastRefresh,
    refresh,
    intervals: INTERVALS,
  }
}
