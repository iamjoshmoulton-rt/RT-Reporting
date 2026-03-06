import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/inventory/total-stocked', label: 'Total Stocked' },
  { to: '/inventory/processed-stocked', label: 'Processed Stock' },
  { to: '/inventory/stock-levels', label: 'Stock Levels' },
  { to: '/inventory/movements', label: 'Movements' },
  { to: '/inventory/stock-summary', label: 'Summary' },
]

export function InventoryLayout() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-[var(--border)] overflow-x-auto">
        {TABS.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border)]',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  )
}
