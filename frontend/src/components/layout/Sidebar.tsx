import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Receipt,
  Package,
  Bell,
  Wrench,
  Factory,
  Headset,
  Target,
  BarChart3,
  FolderKanban,
  UserCheck,
  Settings,
  Store,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission, NAV_PERMISSIONS } from '@/lib/permissions'
import { useEffect } from 'react'

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/sales-dashboard', label: 'Sales Dashboard', icon: BarChart3 },
  { path: '/sales', label: 'Sales', icon: ShoppingCart },
  { path: '/procurement-dashboard', label: 'Procurement Dash', icon: BarChart3 },
  { path: '/procurement', label: 'Procurement', icon: Truck },
  { path: '/accounting', label: 'Accounting', icon: Receipt },
  { path: '/inventory', label: 'Inventory', icon: Package },
  { path: '/manufacturing', label: 'Manufacturing', icon: Factory },
  { path: '/helpdesk', label: 'Helpdesk', icon: Headset },
  { path: '/crm', label: 'CRM', icon: Target },
  { path: '/projects', label: 'Projects', icon: FolderKanban },
  { path: '/customers', label: 'Customers', icon: UserCheck },
  { path: '/ecommerce-invoice', label: 'E-Com (Invoice)', icon: Store },
  { path: '/ecommerce-order', label: 'E-Com (Orders)', icon: Store },
  { path: '/alerts', label: 'Alerts', icon: Bell },
  { path: '/report-builder', label: 'Report Builder', icon: Wrench },
  { path: '/settings', label: 'Settings', icon: Settings },
]

type SidebarProps = {
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
}

export function Sidebar({ collapsed, onCollapsedChange, mobileOpen, onMobileOpenChange }: SidebarProps) {
  const location = useLocation()
  const { permissions } = useAuth()

  useEffect(() => {
    onMobileOpenChange(false)
  }, [location.pathname, onMobileOpenChange])

  const visibleItems = navItems.filter(item => {
    const requiredPerm = NAV_PERMISSIONS[item.path]
    if (!requiredPerm) return true
    return hasPermission(permissions, requiredPerm)
  })

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-sm">RT</span>
            </div>
            <span className="text-white font-heading text-lg font-bold tracking-wide">
              RT Reporting
            </span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">RT</span>
          </div>
        )}
        <button
          onClick={() => onCollapsedChange(!collapsed)}
          className="text-white/60 hover:text-white transition-colors hidden lg:block"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        <button
          onClick={() => onMobileOpenChange(false)}
          className="text-white/60 hover:text-white transition-colors lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {visibleItems.map(item => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/dashboard' && location.pathname.startsWith(item.path))
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-all',
                isActive
                  ? 'bg-primary/20 text-primary'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {(!collapsed || mobileOpen) && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>
    </>
  )

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => onMobileOpenChange(false)}
        />
      )}

      {/* Mobile slide-out sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-72 flex-col transition-transform duration-300 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        )}
        style={{ background: 'var(--sidebar-bg)' }}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-dark-border transition-all duration-300 lg:flex',
          collapsed ? 'w-20' : 'w-64'
        )}
        style={{ background: 'var(--sidebar-bg)' }}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
