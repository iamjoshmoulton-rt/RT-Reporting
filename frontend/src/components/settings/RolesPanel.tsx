import { useState } from 'react'
import { Plus, Pencil, Trash2, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  useRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
} from '@/api/hooks'
import type { RoleResponse, PermissionResponse } from '@/types/api'

// Mirror backend app/auth/permissions.py RESOURCES and ACTIONS
const RESOURCES: Record<string, string[]> = {
  dashboard: [
    'dashboard.kpi_revenue',
    'dashboard.kpi_orders',
    'dashboard.kpi_gross_margin',
    'dashboard.kpi_receivables',
    'dashboard.revenue_chart',
    'dashboard.orders_chart',
    'dashboard.top_products',
    'dashboard.top_customers',
  ],
  sales: [
    'sales.revenue_chart',
    'sales.orders_chart',
    'sales.order_table',
    'sales.order_detail',
    'sales.by_product',
    'sales.by_customer',
    'sales.by_salesperson',
    'sales.export_csv',
    'sales.export_excel',
    'sales.export_pdf',
  ],
  procurement: [
    'procurement.orders_chart',
    'procurement.spend_chart',
    'procurement.order_table',
    'procurement.order_detail',
    'procurement.by_vendor',
    'procurement.by_product',
    'procurement.export_csv',
    'procurement.export_excel',
    'procurement.export_pdf',
  ],
  accounting: [
    'accounting.pl_statement',
    'accounting.balance_sheet',
    'accounting.receivable_aging',
    'accounting.payable_aging',
    'accounting.journal_entries',
    'accounting.tax_summary',
    'accounting.export_csv',
    'accounting.export_excel',
    'accounting.export_pdf',
  ],
  inventory: [
    'inventory.stock_levels',
    'inventory.stock_chart',
    'inventory.movements',
    'inventory.valuation',
    'inventory.by_warehouse',
    'inventory.by_product',
    'inventory.export_csv',
    'inventory.export_excel',
    'inventory.export_pdf',
  ],
  manufacturing: [
    'manufacturing.summary',
    'manufacturing.production_chart',
    'manufacturing.top_products',
    'manufacturing.order_table',
    'manufacturing.export_csv',
    'manufacturing.export_excel',
    'manufacturing.export_pdf',
  ],
  helpdesk: [
    'helpdesk.summary',
    'helpdesk.tickets_chart',
    'helpdesk.by_stage',
    'helpdesk.ticket_table',
    'helpdesk.export_csv',
    'helpdesk.export_excel',
    'helpdesk.export_pdf',
  ],
  crm: [
    'crm.summary',
    'crm.pipeline',
    'crm.leads_chart',
    'crm.lead_table',
    'crm.export_csv',
    'crm.export_excel',
    'crm.export_pdf',
  ],
  projects: [
    'projects.summary',
    'projects.by_project',
    'projects.tasks_chart',
    'projects.task_table',
    'projects.export_csv',
    'projects.export_excel',
    'projects.export_pdf',
  ],
  customers: [
    'customers.summary',
    'customers.top_customers',
    'customers.customers_chart',
    'customers.customer_table',
    'customers.export_csv',
    'customers.export_excel',
    'customers.export_pdf',
  ],
  reports: ['reports.builder', 'reports.saved'],
  alerts: ['alerts.view', 'alerts.create', 'alerts.manage'],
  settings: [
    'settings.users',
    'settings.roles',
    'settings.permissions',
    'settings.scheduled_reports',
    'settings.api_keys',
  ],
}

const ACTIONS = ['view', 'export', 'manage'] as const

function permissionsToSet(permissions: PermissionResponse[]): Set<string> {
  const set = new Set<string>()
  for (const p of permissions) {
    set.add(`${p.resource}:${p.action}`)
  }
  return set
}

function buildPermissionsFromMatrix(selected: Set<string>): { resource: string; action: string }[] {
  const out: { resource: string; action: string }[] = []
  selected.forEach((key) => {
    const [resource, action] = key.split(':')
    if (resource && action) out.push({ resource, action })
  })
  return out
}

const inputClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none'
const labelClass = 'block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5'

export function RolesPanel() {
  const { data: roles, isLoading } = useRoles()
  const createRole = useCreateRole()
  const updateRole = useUpdateRole()
  const deleteRole = useDeleteRole()

  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createPerms, setCreatePerms] = useState<Set<string>>(new Set())
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set())

  const startEdit = (r: RoleResponse) => {
    setEditingId(r.id)
    setEditName(r.name)
    setEditDescription(r.description ?? '')
    setEditPerms(permissionsToSet(r.permissions))
  }

  const cancelEdit = () => setEditingId(null)

  const toggleCreatePerm = (resource: string, action: string) => {
    const key = `${resource}:${action}`
    setCreatePerms((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleEditPerm = (resource: string, action: string) => {
    const key = `${resource}:${action}`
    setEditPerms((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleCreate = () => {
    if (!createName.trim()) {
      toast.error('Role name is required')
      return
    }
    createRole.mutate(
      {
        name: createName.trim(),
        description: createDescription.trim() || undefined,
        permissions: buildPermissionsFromMatrix(createPerms),
      },
      {
        onSuccess: () => {
          toast.success('Role created')
          setShowCreate(false)
          setCreateName('')
          setCreateDescription('')
          setCreatePerms(new Set())
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  const handleUpdate = () => {
    if (!editingId) return
    updateRole.mutate(
      {
        id: editingId,
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        permissions: buildPermissionsFromMatrix(editPerms),
      },
      {
        onSuccess: () => {
          toast.success('Role updated')
          setEditingId(null)
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  const handleDelete = (id: string, isSystem: boolean) => {
    if (isSystem) {
      toast.error('Cannot delete system roles')
      return
    }
    if (!window.confirm('Delete this role? Users will lose these permissions.')) return
    deleteRole.mutate(id, {
      onSuccess: () => toast.success('Role deleted'),
      onError: (e) => toast.error(e.message),
    })
  }

  const PermissionMatrix = ({
    selected,
    onToggle,
  }: {
    selected: Set<string>
    onToggle: (resource: string, action: string) => void
  }) => (
    <div className="space-y-4 max-h-96 overflow-y-auto">
      {Object.entries(RESOURCES).map(([page, resources]) => (
        <div key={page} className="rounded-lg border border-[var(--border)] p-3">
          <h4 className="font-heading font-bold text-[var(--foreground)] capitalize mb-2">{page}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {resources.map((resource) => (
              <div key={resource} className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-[var(--muted-foreground)] w-32 truncate" title={resource}>
                  {resource.split('.')[1] ?? resource}
                </span>
                {ACTIONS.map((action) => (
                  <label key={`${resource}-${action}`} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(`${resource}:${action}`)}
                      onChange={() => onToggle(resource, action)}
                      className="rounded border-[var(--border)]"
                    />
                    <span className="text-xs text-[var(--foreground)]">{action}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-[var(--card)] p-8 text-center text-[var(--muted-foreground)]">
        Loading roles…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-heading font-bold text-[var(--foreground)]">Roles & Permissions</h2>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm text-white hover:bg-primary-hover transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Role
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border bg-[var(--card)] p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-heading font-bold text-[var(--card-foreground)]">Create Role</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Name</label>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Analyst"
              />
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <input
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                className={inputClass}
                placeholder="Optional description"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Permissions</label>
            <PermissionMatrix selected={createPerms} onToggle={toggleCreatePerm} />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={createRole.isPending}
              className="rounded-lg bg-primary px-6 py-2 text-sm text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              Create Role
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-[var(--border)] px-6 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(roles ?? []).map((r) => (
          <div
            key={r.id}
            className={cn(
              'rounded-xl border bg-[var(--card)] p-5 shadow-sm',
              editingId === r.id && 'ring-2 ring-primary'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-heading font-bold text-[var(--card-foreground)]">{r.name}</h3>
                  {r.is_system && (
                    <span className="rounded px-1.5 py-0.5 text-xs bg-primary/20 text-primary flex items-center gap-1">
                      <Shield className="h-3 w-3" /> System
                    </span>
                  )}
                </div>
                {r.description && (
                  <p className="text-sm text-[var(--muted-foreground)] mt-1">{r.description}</p>
                )}
                <p className="text-xs text-[var(--muted-foreground)] mt-2">
                  {r.permissions.length} permission{r.permissions.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {editingId !== r.id && (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="p-1.5 text-[var(--muted-foreground)] hover:bg-primary/10 hover:text-primary rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id, r.is_system)}
                      disabled={r.is_system}
                      className="p-1.5 text-[var(--muted-foreground)] hover:bg-danger/10 hover:text-danger rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={r.is_system ? 'System roles cannot be deleted' : 'Delete'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {editingId === r.id && (
              <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Name</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Description</label>
                    <input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Permissions</label>
                  <PermissionMatrix selected={editPerms} onToggle={toggleEditPerm} />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleUpdate}
                    disabled={updateRole.isPending}
                    className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {(!roles || roles.length === 0) && !showCreate && (
        <div className="rounded-xl border bg-[var(--card)] p-8 text-center text-[var(--muted-foreground)]">
          No roles configured
        </div>
      )}
    </div>
  )
}
