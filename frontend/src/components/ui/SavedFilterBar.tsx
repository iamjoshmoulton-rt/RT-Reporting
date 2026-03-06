import { useState, useRef, useEffect } from 'react'
import { Bookmark, Star, Trash2, Save, ChevronDown } from 'lucide-react'
import { useSavedFilters } from '@/hooks/useSavedFilters'
import { cn } from '@/lib/utils'

interface SavedFilterBarProps {
  pageName: string
  currentFilters: Record<string, unknown>
  onApplyFilter: (filters: Record<string, unknown>) => void
}

export function SavedFilterBar({ pageName, currentFilters, onApplyFilter }: SavedFilterBarProps) {
  const { filters, saveFilter, setDefault, deleteFilter, isSaving } = useSavedFilters(pageName)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const saveRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false)
      if (saveRef.current && !saveRef.current.contains(e.target as Node)) setSaveOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSave = () => {
    if (!saveName.trim()) return
    saveFilter({ name: saveName.trim(), filters: currentFilters })
    setSaveName('')
    setSaveOpen(false)
  }

  const activeFilter = filters.find(f => {
    const fFilters = f.filters as Record<string, unknown>
    return (
      fFilters.date_from === currentFilters.date_from &&
      fFilters.date_to === currentFilters.date_to &&
      fFilters.group_by === currentFilters.group_by &&
      fFilters.compare_to === currentFilters.compare_to
    )
  })

  return (
    <div className="flex items-center gap-2">
      {/* Saved filters dropdown */}
      {filters.length > 0 && (
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(o => !o)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors',
              activeFilter
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-primary/10 hover:text-primary'
            )}
          >
            <Bookmark className="h-3.5 w-3.5" />
            {activeFilter?.name || 'Saved Views'}
            <ChevronDown className={cn('h-3 w-3 transition-transform', dropdownOpen && 'rotate-180')} />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3 py-2 border-b border-[var(--border)]">
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                  Saved Views ({filters.length})
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto py-1">
                {filters.map(f => (
                  <div
                    key={f.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--accent)] group"
                  >
                    <button
                      type="button"
                      className="flex-1 text-left text-sm truncate"
                      onClick={() => {
                        onApplyFilter(f.filters)
                        setDropdownOpen(false)
                      }}
                    >
                      {f.name}
                    </button>
                    <button
                      type="button"
                      title={f.is_default ? 'Remove default' : 'Set as default'}
                      onClick={() => setDefault(f.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Star className={cn('h-3.5 w-3.5', f.is_default ? 'fill-yellow-400 text-yellow-400' : 'text-[var(--muted-foreground)]')} />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => deleteFilter(f.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--muted-foreground)] hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save current filter button */}
      <div ref={saveRef} className="relative">
        <button
          type="button"
          onClick={() => setSaveOpen(o => !o)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] hover:border-primary/40 hover:text-primary transition-colors"
        >
          <Save className="h-3.5 w-3.5" />
          Save View
        </button>

        {saveOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl p-3 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="View name..."
                autoFocus
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={!saveName.trim() || isSaving}
                className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
