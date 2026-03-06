import { useState, Fragment } from 'react'
import { Plus, Pencil, User as UserIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  useUsers,
  useRoles,
  useCreateUser,
  useUpdateUser,
} from '@/api/hooks'
import type { UserResponse } from '@/types/api'

const inputClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-primary focus:outline-none'
const labelClass = 'block text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5'

export function UsersPanel() {
  const { data: users, isLoading } = useUsers()
  const { data: roles } = useRoles()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()

  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [createEmail, setCreateEmail] = useState('')
  const [createFullName, setCreateFullName] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createRoleIds, setCreateRoleIds] = useState<string[]>([])
  const [editFullName, setEditFullName] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [editRoleIds, setEditRoleIds] = useState<string[]>([])

  const startEdit = (u: UserResponse) => {
    setEditingId(u.id)
    setEditFullName(u.full_name)
    setEditActive(u.is_active)
    setEditRoleIds(u.roles.map((r) => r.id))
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const handleCreate = () => {
    if (!createEmail.trim() || !createFullName.trim()) {
      toast.error('Email and full name are required')
      return
    }
    createUser.mutate(
      {
        email: createEmail.trim(),
        full_name: createFullName.trim(),
        password: createPassword.trim() || undefined,
        role_ids: createRoleIds,
      },
      {
        onSuccess: () => {
          toast.success('User created')
          setShowCreate(false)
          setCreateEmail('')
          setCreateFullName('')
          setCreatePassword('')
          setCreateRoleIds([])
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  const handleUpdate = () => {
    if (!editingId) return
    updateUser.mutate(
      {
        id: editingId,
        full_name: editFullName,
        is_active: editActive,
        role_ids: editRoleIds,
      },
      {
        onSuccess: () => {
          toast.success('User updated')
          setEditingId(null)
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  const toggleRole = (roleId: string, current: string[], set: (ids: string[]) => void) => {
    if (current.includes(roleId)) {
      set(current.filter((id) => id !== roleId))
    } else {
      set([...current, roleId])
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-[var(--card)] p-8 text-center text-[var(--muted-foreground)]">
        Loading users…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-heading font-bold text-[var(--foreground)]">Users</h2>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm text-white hover:bg-primary-hover transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border bg-[var(--card)] p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-heading font-bold text-[var(--card-foreground)]">Create User</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                className={inputClass}
                placeholder="user@refreshedtech.com"
              />
            </div>
            <div>
              <label className={labelClass}>Full name</label>
              <input
                value={createFullName}
                onChange={(e) => setCreateFullName(e.target.value)}
                className={inputClass}
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label className={labelClass}>Password (optional – leave blank for Google SSO)</label>
              <input
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className={labelClass}>Roles</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {(roles ?? []).map((r) => (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createRoleIds.includes(r.id)}
                      onChange={() => toggleRole(r.id, createRoleIds, setCreateRoleIds)}
                      className="rounded border-[var(--border)]"
                    />
                    <span className="text-sm text-[var(--foreground)]">{r.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={createUser.isPending}
              className="rounded-lg bg-primary px-6 py-2 text-sm text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              Create User
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

      <div className="rounded-xl border bg-[var(--card)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/30">
                <th className="text-left py-3 px-4 font-heading font-bold text-[var(--foreground)]">User</th>
                <th className="text-left py-3 px-4 font-heading font-bold text-[var(--foreground)]">Email</th>
                <th className="text-left py-3 px-4 font-heading font-bold text-[var(--foreground)]">Auth</th>
                <th className="text-left py-3 px-4 font-heading font-bold text-[var(--foreground)]">Roles</th>
                <th className="text-left py-3 px-4 font-heading font-bold text-[var(--foreground)]">Status</th>
                <th className="text-left py-3 px-4 font-heading font-bold text-[var(--foreground)]">Created</th>
                <th className="w-10 py-3 px-4" />
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => (
                <Fragment key={u.id}>
                  <tr
                    key={u.id}
                    className={cn(
                      'border-b border-[var(--border)] hover:bg-[var(--muted)]/20',
                      editingId === u.id && 'bg-primary/5'
                    )}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {u.picture_url ? (
                          <img src={u.picture_url} alt="" className="h-8 w-8 rounded-full" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <UserIcon className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <span className="font-medium text-[var(--foreground)]">{u.full_name}</span>
                        {u.is_superadmin && (
                          <span className="rounded px-1.5 py-0.5 text-xs bg-primary/20 text-primary">Superadmin</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[var(--muted-foreground)]">{u.email}</td>
                    <td className="py-3 px-4 text-[var(--muted-foreground)] capitalize">{u.auth_provider}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <span
                            key={r.id}
                            className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--foreground)]"
                          >
                            {r.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs',
                          u.is_active ? 'bg-success/10 text-success' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                        )}
                      >
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[var(--muted-foreground)]">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      {editingId !== u.id && (
                        <button
                          type="button"
                          onClick={() => startEdit(u)}
                          className="p-1.5 text-[var(--muted-foreground)] hover:bg-primary/10 hover:text-primary rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                  {editingId === u.id && (
                    <tr key={`${u.id}-edit`} className="border-b border-[var(--border)] bg-[var(--muted)]/10">
                      <td colSpan={7} className="py-4 px-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl">
                          <div>
                            <label className={labelClass}>Full name</label>
                            <input
                              value={editFullName}
                              onChange={(e) => setEditFullName(e.target.value)}
                              className={inputClass}
                            />
                          </div>
                          <div className="flex items-center gap-4">
                            <label className={labelClass}>Active</label>
                            <label className="flex items-center gap-2 cursor-pointer mt-6">
                              <input
                                type="checkbox"
                                checked={editActive}
                                onChange={(e) => setEditActive(e.target.checked)}
                                className="rounded border-[var(--border)]"
                              />
                              <span className="text-sm text-[var(--foreground)]">Account active</span>
                            </label>
                          </div>
                          <div className="md:col-span-2 lg:col-span-1">
                            <label className={labelClass}>Roles</label>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {(roles ?? []).map((r) => (
                                <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editRoleIds.includes(r.id)}
                                    onChange={() => toggleRole(r.id, editRoleIds, setEditRoleIds)}
                                    className="rounded border-[var(--border)]"
                                  />
                                  <span className="text-sm text-[var(--foreground)]">{r.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <button
                            type="button"
                            onClick={handleUpdate}
                            disabled={updateUser.isPending}
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
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {(!users || users.length === 0) && !showCreate && (
          <div className="p-8 text-center text-[var(--muted-foreground)]">No users yet</div>
        )}
      </div>
    </div>
  )
}
