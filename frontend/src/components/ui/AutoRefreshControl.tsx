import { RefreshCw } from 'lucide-react'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

export function AutoRefreshControl() {
  const { interval, setInterval, lastRefresh, refresh, intervals } = useAutoRefresh()

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={refresh}
        className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--muted-foreground)] hover:bg-primary/10 hover:text-primary transition-colors"
        title="Refresh now"
      >
        <RefreshCw className="h-4 w-4" />
      </button>
      <select
        value={interval}
        onChange={e => setInterval(parseInt(e.target.value))}
        className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs text-[var(--foreground)] focus:border-primary focus:outline-none"
      >
        {intervals.map(i => (
          <option key={i.value} value={i.value}>{i.label}</option>
        ))}
      </select>
      <span className="text-xs text-[var(--muted-foreground)]">
        {lastRefresh.toLocaleTimeString()}
      </span>
      {interval > 0 && (
        <span className="flex items-center gap-1 text-xs text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          Live
        </span>
      )}
    </div>
  )
}
