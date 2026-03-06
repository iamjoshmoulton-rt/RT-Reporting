import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { SavedFilterResponse } from '@/types/api'

export type { SavedFilterResponse as SavedFilter }

export function useSavedFilters(page: string) {
  const queryClient = useQueryClient()

  const { data: filters = [] } = useQuery({
    queryKey: ['saved-filters', page],
    queryFn: () => api.get<SavedFilterResponse[]>('/saved-filters', { page }),
  })

  const defaultFilter = filters.find(f => f.is_default) ?? null

  const saveMutation = useMutation({
    mutationFn: (data: { name: string; filters: Record<string, unknown> }) =>
      api.post('/saved-filters', { page, ...data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-filters', page] }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; filters?: Record<string, unknown> }) =>
      api.patch<SavedFilterResponse>(`/saved-filters/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-filters', page] }),
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch<SavedFilterResponse>(`/saved-filters/${id}/set-default`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-filters', page] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/saved-filters/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-filters', page] }),
  })

  return {
    filters,
    defaultFilter,
    saveFilter: saveMutation.mutate,
    updateFilter: updateMutation.mutate,
    setDefault: setDefaultMutation.mutate,
    deleteFilter: deleteMutation.mutate,
    isSaving: saveMutation.isPending,
  }
}
