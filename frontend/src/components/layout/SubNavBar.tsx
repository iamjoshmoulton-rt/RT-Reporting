import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SubNavItem = {
  label: string
  path?: string
  children?: { label: string; path: string }[]
}

type SubNavBarProps = {
  items: SubNavItem[]
  basePath: string
}

export function SubNavBar({ items, basePath }: SubNavBarProps) {
  const location = useLocation()
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setOpenDropdown(null)
  }, [location.pathname])

  const fullPath = (path: string) => `${basePath}/${path}`
  const isActive = (path: string) => location.pathname === fullPath(path)
  const isGroupActive = (children: { path: string }[]) =>
    children.some(c => isActive(c.path))
  const activeChildLabel = (children: { label: string; path: string }[]) =>
    children.find(c => isActive(c.path))?.label

  return (
    <div className="border-b border-[var(--border)] bg-[var(--background)]">
      <div className="flex items-center gap-1 px-4 sm:px-6 lg:px-8">
        {items.map(item => {
          if (item.children) {
            const groupActive = isGroupActive(item.children)
            const currentLabel = activeChildLabel(item.children)
            return (
              <div key={item.label} className="relative" ref={dropdownRef}>
                <button
                  onClick={() =>
                    setOpenDropdown(openDropdown === item.label ? null : item.label)
                  }
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                    groupActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  )}
                >
                  {currentLabel ?? item.label}
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      openDropdown === item.label && 'rotate-180'
                    )}
                  />
                </button>
                {openDropdown === item.label && (
                  <div className="absolute left-0 top-full z-50 mt-px min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
                    {item.children.map(child => (
                      <Link
                        key={child.path}
                        to={fullPath(child.path)}
                        className={cn(
                          'block px-4 py-2.5 text-sm transition-colors',
                          isActive(child.path)
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-[var(--card-foreground)] hover:bg-[var(--accent)]'
                        )}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.path}
              to={fullPath(item.path!)}
              className={cn(
                'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                isActive(item.path!)
                  ? 'border-primary text-primary'
                  : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
