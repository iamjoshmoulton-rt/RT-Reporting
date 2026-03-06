export interface ErrorEntry {
  message: string
  source?: string
  timestamp: string
}

export interface PageVisit {
  url: string
  path: string
  timestamp: string
}

const MAX_ERRORS = 10
const MAX_PAGE_VISITS = 50
const recentErrors: ErrorEntry[] = []
const pageVisits: PageVisit[] = []
let installed = false

function pushError(entry: ErrorEntry) {
  recentErrors.push(entry)
  if (recentErrors.length > MAX_ERRORS) recentErrors.shift()
}

export function trackPageVisit(path: string) {
  const last = pageVisits[pageVisits.length - 1]
  if (last?.path === path) return
  pageVisits.push({
    url: window.location.href,
    path,
    timestamp: new Date().toISOString(),
  })
  if (pageVisits.length > MAX_PAGE_VISITS) pageVisits.shift()
}

export function getPageVisits(): PageVisit[] {
  return [...pageVisits]
}

export function installErrorCollector() {
  if (installed) return
  installed = true

  const prevOnError = window.onerror
  window.onerror = (message, source, lineno, _colno, _error) => {
    pushError({
      message: String(message),
      source: source ? `${source}:${lineno}` : undefined,
      timestamp: new Date().toISOString(),
    })
    if (typeof prevOnError === 'function') {
      prevOnError(message, source, lineno, _colno, _error)
    }
  }

  const prevOnUnhandled = window.onunhandledrejection
  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const msg = event.reason instanceof Error
      ? event.reason.message
      : String(event.reason)
    pushError({
      message: `Unhandled rejection: ${msg}`,
      timestamp: new Date().toISOString(),
    })
    if (typeof prevOnUnhandled === 'function') {
      prevOnUnhandled.call(window, event)
    }
  }
}

export function getRecentErrors(): ErrorEntry[] {
  return [...recentErrors].slice(-5)
}
