import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Sun, Moon, LogOut, Settings, Menu,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'

export type SubNavItem = {
  label: string
  path?: string
  children?: { label: string; path: string }[]
}

type PageMeta = {
  title: string
  subtitle: string
  basePath?: string
  subNav?: SubNavItem[]
}

const PAGE_META: Record<string, PageMeta> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Business intelligence overview' },
  '/sales': { title: 'Sales', subtitle: 'Sales orders, revenue analysis, and performance metrics' },
  '/procurement': { title: 'Procurement', subtitle: 'Purchase orders, vendor analysis, and spend tracking' },
  '/accounting': { title: 'Accounting', subtitle: 'P&L overview, aging reports, and invoice tracking' },
  '/inventory': {
    title: 'Inventory',
    subtitle: 'Stock levels, movements, and warehouse overview',
    basePath: '/inventory',
    subNav: [
      {
        label: 'Stocked',
        children: [
          { label: 'Total Stocked', path: 'total-stocked' },
          { label: 'Processed Stocked', path: 'processed-stocked' },
          { label: 'Stock Summary', path: 'stock-summary' },
        ],
      },
    ],
  },
  '/alerts': { title: 'Smart Alerts', subtitle: 'Configure threshold alerts and notification history' },
  '/report-builder': { title: 'Report Builder', subtitle: 'Build custom reports with filters and grouping' },
  '/settings': { title: 'Settings', subtitle: 'Manage scheduled reports and system configuration' },
}

function getPageMeta(pathname: string): PageMeta {
  const match = Object.keys(PAGE_META)
    .sort((a, b) => b.length - a.length)
    .find(key => pathname.startsWith(key))
  return match ? PAGE_META[match] : { title: '', subtitle: '' }
}

type TopBarProps = {
  onMobileMenuOpen: () => void
}

export function TopBar({ onMobileMenuOpen }: TopBarProps) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [profileOpen, setProfileOpen] = useState(false)
  const [navDropdown, setNavDropdown] = useState<string | null>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)

  const meta = getPageMeta(location.pathname)
  const { subNav, basePath } = meta

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setNavDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setProfileOpen(false)
    setNavDropdown(null)
  }, [location.pathname])

  const fullPath = (path: string) => `${basePath}/${path}`
  const isNavActive = (path: string) => location.pathname === fullPath(path)
  const isGroupActive = (children: { path: string }[]) =>
    children.some(c => isNavActive(c.path))
  const activeChildLabel = (children: { label: string; path: string }[]) =>
    children.find(c => isNavActive(c.path))?.label

  function renderNavItems() {
    if (!subNav || subNav.length === 0) return null

    return subNav.map(item => {
      if (item.children) {
        const groupActive = isGroupActive(item.children)
        const currentLabel = activeChildLabel(item.children)
        return (
          <div key={item.label} className="relative">
            <button
              onClick={() =>
                setNavDropdown(navDropdown === item.label ? null : item.label)
              }
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                groupActive
                  ? 'bg-primary/20 text-primary'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              )}
            >
              {currentLabel ?? item.label}
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform',
                  navDropdown === item.label && 'rotate-180'
                )}
              />
            </button>
            {navDropdown === item.label && (
              <div className="absolute left-0 top-full z-50 mt-2 min-w-[200px] rounded-xl border border-white/10 bg-navy-light py-1.5 shadow-2xl">
                {item.children.map(child => (
                  <Link
                    key={child.path}
                    to={fullPath(child.path)}
                    className={cn(
                      'block px-4 py-2.5 text-sm transition-colors',
                      isNavActive(child.path)
                        ? 'bg-primary/15 text-primary font-medium'
                        : 'text-white/70 hover:text-white hover:bg-white/5'
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
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
            isNavActive(item.path!)
              ? 'bg-primary/20 text-primary'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          )}
        >
          {item.label}
        </Link>
      )
    })
  }

  return (
    <header className="sticky top-0 z-30 bg-navy border-b border-white/10">
      <div className="flex items-center h-14 px-4 sm:px-6 lg:px-8" ref={navRef}>
        {/* Left: mobile menu + page title */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onMobileMenuOpen}
            className="shrink-0 rounded-lg p-1.5 text-white/60 hover:text-white hover:bg-white/10 transition-colors lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-heading font-bold text-white truncate">
            {meta.title}
          </h1>
        </div>

        {/* Sub-nav links */}
        {subNav && subNav.length > 0 && (
          <>
            <div className="h-6 w-px bg-white/15 mx-4 shrink-0" />
            <nav className="flex items-center gap-0.5 min-w-0">
              {renderNavItems()}
            </nav>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* Right: actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>

          {/* User profile */}
          {user && (
            <div className="relative ml-1" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors',
                  profileOpen
                    ? 'bg-white/10'
                    : 'hover:bg-white/10'
                )}
              >
                {user.picture_url ? (
                  <img
                    src={user.picture_url}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover ring-2 ring-white/20"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-primary/20 ring-2 ring-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-medium text-white/90 hidden md:block max-w-[120px] truncate">
                  {user.full_name}
                </span>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 text-white/40 transition-transform hidden md:block',
                    profileOpen && 'rotate-180'
                  )}
                />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-white/10 bg-navy-light shadow-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      {user.picture_url ? (
                        <img
                          src={user.picture_url}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                          {user.full_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {user.full_name}
                        </p>
                        <p className="text-xs text-white/50 truncate">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="py-1">
                    <Link
                      to="/settings"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                    <button
                      onClick={logout}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
