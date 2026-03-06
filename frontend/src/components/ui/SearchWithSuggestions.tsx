import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, User, MapPin, Mail } from 'lucide-react'
import { useCustomerSuggest } from '@/api/hooks'
import { cn } from '@/lib/utils'

interface SearchWithSuggestionsProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchWithSuggestions({ value, onChange, placeholder = 'Search customers...' }: SearchWithSuggestionsProps) {
  const navigate = useNavigate()
  const [localValue, setLocalValue] = useState(value)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: suggestions } = useCustomerSuggest(localValue)

  useEffect(() => { setLocalValue(value) }, [value])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleInput = useCallback((val: string) => {
    setLocalValue(val)
    setSelectedIndex(-1)
    setShowDropdown(val.length >= 2)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onChange(val)
    }, 400)
  }, [onChange])

  const clearSearch = useCallback(() => {
    setLocalValue('')
    setShowDropdown(false)
    setSelectedIndex(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    onChange('')
    inputRef.current?.focus()
  }, [onChange])

  const goToCustomer = useCallback((id: number) => {
    setShowDropdown(false)
    navigate(`/customers/${id}`)
  }, [navigate])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || !suggestions?.length) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      goToCustomer(suggestions[selectedIndex].id)
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  // Highlight matching text
  const highlight = (text: string) => {
    if (!localValue || localValue.length < 2) return text
    const re = new RegExp(`(${localValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(re)
    return parts.map((part, i) =>
      re.test(part) ? <mark key={i} className="bg-primary/20 text-primary rounded-sm px-0.5">{part}</mark> : part
    )
  }

  return (
    <div ref={containerRef} className="relative max-w-md w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted-foreground)]" />
        <input
          ref={inputRef}
          type="text"
          value={localValue}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (localValue.length >= 2) setShowDropdown(true) }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-9 pr-8 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-primary focus:outline-none transition-colors"
        />
        {localValue && (
          <button
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showDropdown && suggestions && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Suggestions ({suggestions.length})
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {suggestions.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goToCustomer(s.id)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={cn(
                  'w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors',
                  i === selectedIndex ? 'bg-primary/8' : 'hover:bg-[var(--accent)]',
                )}
              >
                <div
                  className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg mt-0.5"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}
                >
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--card-foreground)] truncate">
                    {highlight(s.name)}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {s.email && (
                      <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] truncate">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        {highlight(s.email)}
                      </span>
                    )}
                    {s.city && (
                      <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] truncate">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        {highlight(s.city)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--muted)]/30">
            <p className="text-[10px] text-[var(--muted-foreground)]">
              Press <kbd className="px-1 py-0.5 rounded bg-[var(--muted)] text-[10px]">↑↓</kbd> to navigate · <kbd className="px-1 py-0.5 rounded bg-[var(--muted)] text-[10px]">Enter</kbd> to view · <kbd className="px-1 py-0.5 rounded bg-[var(--muted)] text-[10px]">Esc</kbd> to close
            </p>
          </div>
        </div>
      )}

      {/* No results state */}
      {showDropdown && localValue.length >= 2 && suggestions && suggestions.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg p-4">
          <p className="text-sm text-[var(--muted-foreground)] text-center">No customers found matching "{localValue}"</p>
        </div>
      )}
    </div>
  )
}
