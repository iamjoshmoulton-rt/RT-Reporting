import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { SupportWidget } from '@/components/support/SupportWidget'
import { installErrorCollector } from '@/hooks/useErrorCollector'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => { installErrorCollector() }, [])

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onMobileOpenChange={setMobileMenuOpen}
      />
      <div
        className={cn(
          'flex-1 min-w-0 flex flex-col transition-all duration-300',
          sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
        )}
      >
        <TopBar onMobileMenuOpen={() => setMobileMenuOpen(true)} />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
      <SupportWidget />
    </div>
  )
}
