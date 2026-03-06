import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import ReactGridLayout from 'react-grid-layout/legacy'
import type { Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { AutoRefreshControl } from '@/components/ui/AutoRefreshControl'
import {
  useDashboards,
  useMyPermissions,
  useCreateDashboardMutation,
  useUpdateDashboardMutation,
  useDeleteDashboardMutation,
} from '@/api/hooks'
import {
  DEFAULT_DASHBOARD_LAYOUT,
  WIDGET_CATALOG,
  getWidgetCatalogEntry,
} from './Dashboard/widgetCatalog'
import type { LayoutWidget } from '@/types/api'
import { DashboardWidget } from './Dashboard/DashboardWidget'
import { X, Plus, Check, ChevronDown, LayoutDashboard, Star, Trash2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ─── Widget picker dropdown ─── */
function WidgetPicker({
  catalog,
  activeTypes,
  onToggle,
}: {
  catalog: { id: string; label: string }[]
  activeTypes: Set<string>
  onToggle: (id: string, active: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-primary/60 bg-primary/5 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add widget
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Toggle widgets
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {catalog.map(entry => {
              const active = activeTypes.has(entry.id)
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    onToggle(entry.id, active)
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--accent)]',
                    active && 'bg-primary/5'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                      active
                        ? 'border-primary bg-primary text-white'
                        : 'border-[var(--border)] bg-transparent'
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </span>
                  <span className={cn('text-left', active ? 'text-[var(--card-foreground)] font-medium' : 'text-[var(--muted-foreground)]')}>
                    {entry.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const RGL_LAYOUT = (layout: LayoutWidget[]) =>
  layout.map(w => ({ i: w.i, x: w.x, y: w.y, w: w.w, h: w.h }))

function mergeLayoutFromRGL(current: LayoutWidget[], rglLayout: Layout): LayoutWidget[] {
  const byI = new Map(current.map(w => [w.i, w]))
  return rglLayout.map(item => {
    const existing = byI.get(item.i)
    return {
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      widget_type: existing?.widget_type ?? 'kpi_revenue',
      config: existing?.config ?? {},
    }
  })
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (typeof w === 'number' && w > 0) setWidth(w)
    })
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

export function DashboardPage() {
  const [dateFrom] = useState<string | undefined>(undefined)
  const [dateTo] = useState<string | undefined>(undefined)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingLayout, setEditingLayout] = useState<LayoutWidget[]>([])
  const { ref: containerRef, width } = useContainerWidth()

  const [selectedDashboardId, setSelectedDashboardId] = useState<string | null>(null)

  const { data: dashboards } = useDashboards()
  const { data: permissionsData } = useMyPermissions()
  const permissions = useMemo(
    () => new Set(permissionsData?.permissions?.map(p => p.resource) ?? []),
    [permissionsData]
  )
  const defaultDashboard = useMemo(
    () => dashboards?.find(d => d.is_default),
    [dashboards]
  )
  const currentDashboard = useMemo(
    () =>
      selectedDashboardId
        ? dashboards?.find(d => d.id === selectedDashboardId)
        : defaultDashboard ?? null,
    [dashboards, selectedDashboardId, defaultDashboard]
  )
  const layout = useMemo(() => {
    const raw = currentDashboard?.layout ?? defaultDashboard?.layout
    const arr = Array.isArray(raw) ? (raw as LayoutWidget[]) : []
    return arr.length > 0 ? arr : DEFAULT_DASHBOARD_LAYOUT
  }, [currentDashboard, defaultDashboard])

  const displayLayout = isEditMode ? editingLayout : layout
  const gridLayout = useMemo(() => RGL_LAYOUT(displayLayout), [displayLayout])

  const createMutation = useCreateDashboardMutation()
  const updateMutation = useUpdateDashboardMutation()
  const deleteMutation = useDeleteDashboardMutation()

  const enterEditMode = useCallback(() => {
    setEditingLayout(layout)
    setIsEditMode(true)
  }, [layout])

  const exitEditMode = useCallback(() => {
    setIsEditMode(false)
  }, [])

  const onLayoutChange = useCallback((newLayout: Layout) => {
    setEditingLayout(prev => mergeLayoutFromRGL(prev, newLayout))
  }, [])

  const addWidget = useCallback((widgetTypeId: string) => {
    const entry = getWidgetCatalogEntry(widgetTypeId)
    if (!entry) return
    const usedIds = new Set(editingLayout.map(w => w.i))
    let key: string = entry.id
    if (usedIds.has(key)) {
      let n = 1
      while (usedIds.has(`${entry.id}-${n}`)) n++
      key = `${entry.id}-${n}`
    }
    const maxY = editingLayout.length
      ? Math.max(...editingLayout.map(w => w.y + w.h))
      : 0
    const newWidget: LayoutWidget = {
      i: key,
      x: 0,
      y: maxY,
      w: entry.defaultW,
      h: entry.defaultH,
      widget_type: entry.id,
      config: {},
    }
    setEditingLayout(prev => [...prev, newWidget])
  }, [editingLayout])

  const removeWidget = useCallback((i: string) => {
    setEditingLayout(prev => prev.filter(w => w.i !== i))
  }, [])

  const activeWidgetTypes = useMemo(
    () => new Set(editingLayout.map(w => w.widget_type)),
    [editingLayout]
  )

  const toggleWidget = useCallback(
    (widgetTypeId: string, isActive: boolean) => {
      if (isActive) {
        // Remove all instances of this widget type
        setEditingLayout(prev => prev.filter(w => w.widget_type !== widgetTypeId))
      } else {
        addWidget(widgetTypeId)
      }
    },
    [addWidget]
  )

  const saveLayout = useCallback(async () => {
    if (currentDashboard) {
      await updateMutation.mutateAsync({
        id: currentDashboard.id,
        layout: editingLayout,
      })
    } else {
      const created = await createMutation.mutateAsync({
        name: 'My Dashboard',
        layout: editingLayout,
      })
      await updateMutation.mutateAsync({
        id: created.id,
        is_default: true,
      })
      setSelectedDashboardId(created.id)
    }
    exitEditMode()
  }, [currentDashboard, editingLayout, createMutation, updateMutation, exitEditMode])

  const allowedCatalog = useMemo(
    () => WIDGET_CATALOG.filter(e => permissions.has(e.permission)),
    [permissions]
  )

  const setAsDefault = useCallback(
    (id: string) => {
      updateMutation.mutate({ id, is_default: true })
    },
    [updateMutation]
  )
  const deleteDashboard = useCallback(
    (id: string) => {
      deleteMutation.mutate(id, {
        onSuccess: () => {
          if (selectedDashboardId === id) setSelectedDashboardId(null)
        },
      })
    },
    [deleteMutation, selectedDashboardId]
  )
  const createNewDashboard = useCallback(() => {
    createMutation.mutate(
      { name: `Dashboard ${(dashboards?.length ?? 0) + 1}`, layout },
      {
        onSuccess: (created) => setSelectedDashboardId(created.id),
      }
    )
  }, [createMutation, dashboards?.length, layout])

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
      {/* ─── Toolbar ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Left: Dashboard selector */}
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-primary" />
          {dashboards && dashboards.length > 0 && (
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--card-foreground)]"
              value={selectedDashboardId ?? defaultDashboard?.id ?? ''}
              onChange={e => setSelectedDashboardId(e.target.value || null)}
            >
              {dashboards.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.is_default ? '(default)' : ''}
                </option>
              ))}
            </select>
          )}
          {currentDashboard && !currentDashboard.is_default && (
            <button
              type="button"
              onClick={() => setAsDefault(currentDashboard.id)}
              disabled={updateMutation.isPending}
              title="Set as default"
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-[var(--muted-foreground)] hover:text-warning hover:bg-[var(--accent)] disabled:opacity-50 transition-colors"
            >
              <Star className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={createNewDashboard}
            disabled={createMutation.isPending}
            title="New dashboard"
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-[var(--muted-foreground)] hover:text-primary hover:bg-[var(--accent)] disabled:opacity-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
          {currentDashboard && (dashboards?.length ?? 0) > 1 && (
            <button
              type="button"
              onClick={() => deleteDashboard(currentDashboard.id)}
              disabled={deleteMutation.isPending}
              title="Delete dashboard"
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-[var(--muted-foreground)] hover:text-danger hover:bg-danger/5 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <AutoRefreshControl />
          {!isEditMode ? (
            <button
              type="button"
              onClick={enterEditMode}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--card-foreground)] hover:bg-[var(--accent)] transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Customize
            </button>
          ) : (
            <>
              <WidgetPicker
                catalog={allowedCatalog}
                activeTypes={activeWidgetTypes}
                onToggle={toggleWidget}
              />
              <button
                type="button"
                onClick={saveLayout}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Save
              </button>
              <button
                type="button"
                onClick={exitEditMode}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--card-foreground)] hover:bg-[var(--accent)] transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── Edit mode banner ─── */}
      {isEditMode && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary flex items-center gap-2">
          <Pencil className="h-3.5 w-3.5" />
          <span>Editing mode — drag to reposition, resize handles on corners, hover to remove.</span>
        </div>
      )}

      {/* ─── Grid ─── */}
      <div ref={containerRef} className="w-full">
        <ReactGridLayout
          className={cn('layout', isEditMode && 'layout-edit')}
          layout={gridLayout}
          cols={12}
          rowHeight={120}
          width={width}
          isDraggable={isEditMode}
          isResizable={isEditMode}
          onLayoutChange={isEditMode ? onLayoutChange : undefined}
          useCSSTransforms
          margin={[16, 16]}
          containerPadding={[0, 0]}
        >
          {displayLayout.map(w => (
            <div key={w.i} className="min-h-0 relative group">
              {isEditMode && (
                <button
                  type="button"
                  aria-label="Remove widget"
                  className="absolute top-2 right-2 z-10 rounded-full bg-danger/90 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger shadow-md"
                  onClick={() => removeWidget(w.i)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <DashboardWidget widgetType={w.widget_type} dateFrom={dateFrom} dateTo={dateTo} />
            </div>
          ))}
        </ReactGridLayout>
      </div>
    </div>
  )
}
