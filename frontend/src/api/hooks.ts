import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  UserResponse,
  RoleResponse,
  UserPermissionsResponse,
  DashboardSummary,
  PeriodData,
  CustomerData,
  ProductData,
  AgingData,
  LayoutWidget,
  DashboardLayoutResponse,
  UserPreferenceResponse,
  SavedFilterResponse,
  GradingSummary,
  GradeBreakdownItem,
  DailyGradeData,
  CategoryTotalsResponse,
  GradingItemsResponse,
  GradingOverview,
} from '@/types/api'

type DateRangeParams = {
  date_from?: string
  date_to?: string
}

// --- Auth ---

export function useCurrentUser() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<UserResponse>('/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

export function useMyPermissions() {
  return useQuery({
    queryKey: ['auth', 'permissions'],
    queryFn: () => api.get<UserPermissionsResponse>('/auth/me/permissions'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

// --- User management (admin) ---

export function useUsers() {
  return useQuery({
    queryKey: ['auth', 'users'],
    queryFn: () => api.get<UserResponse[]>('/auth/users'),
  })
}

export function useRoles() {
  return useQuery({
    queryKey: ['auth', 'roles'],
    queryFn: () => api.get<RoleResponse[]>('/auth/roles'),
  })
}

interface UserCreatePayload {
  email: string
  full_name: string
  password?: string | null
  role_ids?: string[]
}

interface UserUpdatePayload {
  full_name?: string
  is_active?: boolean
  role_ids?: string[]
}

interface RoleCreatePayload {
  name: string
  description?: string | null
  permissions: { resource: string; action: string }[]
}

interface RoleUpdatePayload {
  name?: string
  description?: string | null
  permissions?: { resource: string; action: string }[]
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UserCreatePayload) => api.post<UserResponse>('/auth/users', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'users'] })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UserUpdatePayload & { id: string }) =>
      api.patch<UserResponse>(`/auth/users/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'users'] })
    },
  })
}

export function useCreateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: RoleCreatePayload) => api.post<RoleResponse>('/auth/roles', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'roles'] })
    },
  })
}

export function useUpdateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: RoleUpdatePayload & { id: string }) =>
      api.put<RoleResponse>(`/auth/roles/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'roles'] })
    },
  })
}

export function useDeleteRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/auth/roles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'roles'] })
      queryClient.invalidateQueries({ queryKey: ['auth', 'users'] })
    },
  })
}

// --- Dashboard ---

export function useDashboardSummary(params: DateRangeParams = {}) {
  return useQuery({
    queryKey: ['dashboard', 'summary', params],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary', params),
  })
}

export function useRevenueTrend(params: DateRangeParams & { group_by?: string } = {}) {
  return useQuery({
    queryKey: ['dashboard', 'revenue-trend', params],
    queryFn: () => api.get<PeriodData[]>('/dashboard/revenue-trend', params),
  })
}

export function useTopCustomers(params: DateRangeParams & { limit?: number } = {}) {
  return useQuery({
    queryKey: ['dashboard', 'top-customers', params],
    queryFn: () => api.get<CustomerData[]>('/dashboard/top-customers', params),
  })
}

export function useTopProducts(params: DateRangeParams & { limit?: number } = {}) {
  return useQuery({
    queryKey: ['dashboard', 'top-products', params],
    queryFn: () => api.get<ProductData[]>('/dashboard/top-products', params),
  })
}

// --- Custom dashboards (layout CRUD) ---

export function useDashboards() {
  return useQuery({
    queryKey: ['dashboards'],
    queryFn: () => api.get<DashboardLayoutResponse[]>('/dashboards'),
  })
}

/** Layout array of the user's default dashboard, or undefined if none. */
export function useDefaultLayout(): LayoutWidget[] | undefined {
  const { data: dashboards } = useDashboards()
  const defaultDashboard = dashboards?.find(d => d.is_default)
  if (defaultDashboard?.layout?.length) return defaultDashboard.layout as LayoutWidget[]
  return undefined
}

export function useCreateDashboardMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; layout: LayoutWidget[] }) =>
      api.post<DashboardLayoutResponse>('/dashboards', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] })
    },
  })
}

export function useUpdateDashboardMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      name,
      layout,
      is_default,
    }: {
      id: string
      name?: string
      layout?: LayoutWidget[]
      is_default?: boolean
    }) => api.put<DashboardLayoutResponse>(`/dashboards/${id}`, { name, layout, is_default }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] })
    },
  })
}

export function useDeleteDashboardMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/dashboards/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] })
    },
  })
}

// --- Sales ---

export interface SalesKpis {
  invoiced_revenue: number
  invoiced_margin: number
  margin_percent: number
  units_sold: number
  open_pipeline: number
  open_pipeline_date: number
  max_potential_revenue: number
  avg_sell_price: number
  revenue_trend: number | null
  invoiced_margin_trend: number | null
  margin_percent_trend: number | null
  units_sold_trend: number | null
  open_pipeline_trend: number | null
  open_pipeline_date_trend: number | null
  max_potential_revenue_trend: number | null
  avg_sell_price_trend: number | null
  invoiced_revenue_budget?: number | null
  invoiced_margin_budget?: number | null
  margin_percent_budget?: number | null
  units_sold_budget?: number | null
  open_pipeline_budget?: number | null
  open_pipeline_date_budget?: number | null
  max_potential_revenue_budget?: number | null
  avg_sell_price_budget?: number | null
}

export function useSalesKpis(params: DateRangeParams & { compare_to?: string } = {}) {
  return useQuery({
    queryKey: ['sales', 'kpis', params],
    queryFn: () => api.get<SalesKpis>('/sales/kpis', params),
  })
}

export function useSalesSummary(params: DateRangeParams = {}) {
  return useQuery({
    queryKey: ['sales', 'summary', params],
    queryFn: () => api.get<{
      total_orders: number; total_revenue: number;
      total_untaxed: number; total_tax: number; avg_order_value: number
    }>('/sales/summary', params),
  })
}

export function useSalesByPeriod(params: DateRangeParams & { group_by?: string; compare_to?: string } = {}) {
  return useQuery({
    queryKey: ['sales', 'by-period', params],
    queryFn: () => api.get<{ current: PeriodData[]; comparison: PeriodData[] | null }>('/sales/by-period', params),
  })
}

export function useSalesByCustomer(params: DateRangeParams & { limit?: number } = {}) {
  return useQuery({
    queryKey: ['sales', 'by-customer', params],
    queryFn: () => api.get<CustomerData[]>('/sales/by-customer', params),
  })
}

export function useSalesByProduct(params: DateRangeParams & { limit?: number } = {}) {
  return useQuery({
    queryKey: ['sales', 'by-product', params],
    queryFn: () => api.get<ProductData[]>('/sales/by-product', params),
  })
}

export function useSalesKpiDrilldown(params: DateRangeParams & {
  kpi: string | null; offset?: number; limit?: number
}) {
  return useQuery({
    queryKey: ['sales', 'kpi-drilldown', params],
    queryFn: () => api.get<{
      total: number
      type: 'orders' | 'lines'
      rows: Record<string, unknown>[]
    }>('/sales/kpi-drilldown', params as Record<string, string | number | undefined>),
    enabled: !!params.kpi,
  })
}

export function useSalesOrders(params: DateRangeParams & {
  state?: string; partner_id?: number; offset?: number; limit?: number; search?: string
} = {}) {
  return useQuery({
    queryKey: ['sales', 'orders', params],
    queryFn: () => api.get<{ total: number; orders: Record<string, unknown>[] }>('/sales/orders', params),
  })
}

// --- Procurement ---

export function useProcurementSummary(params: DateRangeParams = {}) {
  return useQuery({
    queryKey: ['procurement', 'summary', params],
    queryFn: () => api.get<{
      total_orders: number; total_spend: number; total_untaxed: number; avg_order_value: number
    }>('/procurement/summary', params),
  })
}

export function useProcurementByPeriod(params: DateRangeParams & { group_by?: string; compare_to?: string } = {}) {
  return useQuery({
    queryKey: ['procurement', 'by-period', params],
    queryFn: () => api.get<{ current: { period: string; order_count: number; total_spend: number }[]; comparison: { period: string; order_count: number; total_spend: number }[] | null }>('/procurement/by-period', params),
  })
}

export function useProcurementByVendor(params: DateRangeParams & { limit?: number } = {}) {
  return useQuery({
    queryKey: ['procurement', 'by-vendor', params],
    queryFn: () => api.get<{ vendor_id: number; vendor_name: string; order_count: number; total_spend: number }[]>('/procurement/by-vendor', params),
  })
}

export function usePurchaseOrders(params: DateRangeParams & {
  state?: string; partner_id?: number; offset?: number; limit?: number; search?: string
} = {}) {
  return useQuery({
    queryKey: ['procurement', 'orders', params],
    queryFn: () => api.get<{ total: number; orders: Record<string, unknown>[] }>('/procurement/orders', params),
  })
}

// --- Accounting ---

export function useAccountingSummary(params: DateRangeParams = {}) {
  return useQuery({
    queryKey: ['accounting', 'summary', params],
    queryFn: () => api.get<{
      invoices: { count: number; total: number; outstanding: number }
      bills: { count: number; total: number; outstanding: number }
      net_revenue: number
    }>('/accounting/summary', params),
  })
}

export function useRevenueByPeriod(params: DateRangeParams & { group_by?: string; compare_to?: string } = {}) {
  return useQuery({
    queryKey: ['accounting', 'revenue-by-period', params],
    queryFn: () => api.get<{
      current: { period: string; invoice_count: number; total: number; outstanding: number }[]
      comparison: { period: string; invoice_count: number; total: number; outstanding: number }[] | null
    }>('/accounting/revenue-by-period', params),
  })
}

export function useReceivableAging() {
  return useQuery({
    queryKey: ['accounting', 'receivable-aging'],
    queryFn: () => api.get<AgingData>('/accounting/receivable-aging'),
  })
}

export function usePayableAging() {
  return useQuery({
    queryKey: ['accounting', 'payable-aging'],
    queryFn: () => api.get<AgingData>('/accounting/payable-aging'),
  })
}

export function useInvoices(params: DateRangeParams & {
  move_type?: string; payment_state?: string; partner_id?: number;
  offset?: number; limit?: number
} = {}) {
  return useQuery({
    queryKey: ['accounting', 'invoices', params],
    queryFn: () => api.get<{ total: number; invoices: Record<string, unknown>[] }>('/accounting/invoices', params),
  })
}

// --- Inventory ---

export function useInventorySummary() {
  return useQuery({
    queryKey: ['inventory', 'summary'],
    queryFn: () => api.get<{
      unique_products: number; total_quantity: number;
      total_reserved: number; available_quantity: number
    }>('/inventory/summary'),
  })
}

export function useStockLevels(params: { location_id?: number; offset?: number; limit?: number; search?: string } = {}) {
  return useQuery({
    queryKey: ['inventory', 'stock-levels', params],
    queryFn: () => api.get<{ total: number; items: Record<string, unknown>[] }>('/inventory/stock-levels', params),
  })
}

export function useStockMovements(params: DateRangeParams & {
  product_id?: number; state?: string; offset?: number; limit?: number
} = {}) {
  return useQuery({
    queryKey: ['inventory', 'movements', params],
    queryFn: () => api.get<{ total: number; moves: Record<string, unknown>[] }>('/inventory/movements', params),
  })
}

export function useStockByWarehouse() {
  return useQuery({
    queryKey: ['inventory', 'by-warehouse'],
    queryFn: () => api.get<{ warehouse_id: number; warehouse_name: string; total_quantity: number; product_count: number }[]>('/inventory/by-warehouse'),
  })
}

// --- Manufacturing ---

export function useManufacturingSummary(params: DateRangeParams = {}) {
  return useQuery({
    queryKey: ['manufacturing', 'summary', params],
    queryFn: () => api.get<{
      active_mos: number; completed: number; units_produced: number; avg_cycle_days: number
    }>('/manufacturing/summary', params),
  })
}

export function useProductionByPeriod(params: DateRangeParams & { group_by?: string; compare_to?: string } = {}) {
  return useQuery({
    queryKey: ['manufacturing', 'by-period', params],
    queryFn: () => api.get<{
      current: { period: string; mo_count: number; units_produced: number }[]
      comparison: { period: string; mo_count: number; units_produced: number }[] | null
    }>('/manufacturing/by-period', params),
  })
}

export function useTopProductsManufactured(params: DateRangeParams & { limit?: number } = {}) {
  return useQuery({
    queryKey: ['manufacturing', 'top-products', params],
    queryFn: () => api.get<{ product_name: string; mo_count: number; units_produced: number }[]>('/manufacturing/top-products', params),
  })
}

export function useManufacturingOrders(params: DateRangeParams & {
  state?: string; offset?: number; limit?: number; search?: string
} = {}) {
  return useQuery({
    queryKey: ['manufacturing', 'orders', params],
    queryFn: () => api.get<{ total: number; orders: Record<string, unknown>[] }>('/manufacturing/orders', params),
  })
}

// --- Helpdesk ---

export function useHelpdeskSummary(params: DateRangeParams = {}) {
  return useQuery({
    queryKey: ['helpdesk', 'summary', params],
    queryFn: () => api.get<{
      open_tickets: number; new_tickets: number; closed_tickets: number; avg_resolution_days: number
    }>('/helpdesk/summary', params),
  })
}

export function useTicketsByPeriod(params: DateRangeParams & { group_by?: string; compare_to?: string } = {}) {
  return useQuery({
    queryKey: ['helpdesk', 'by-period', params],
    queryFn: () => api.get<{
      current: { period: string; ticket_count: number; closed_count: number }[]
      comparison: { period: string; ticket_count: number; closed_count: number }[] | null
    }>('/helpdesk/by-period', params),
  })
}

export function useTicketsByStage(params: DateRangeParams = {}) {
  return useQuery({
    queryKey: ['helpdesk', 'by-stage', params],
    queryFn: () => api.get<{ stage_name: string; ticket_count: number }[]>('/helpdesk/by-stage', params),
  })
}

export function useHelpdeskTickets(params: DateRangeParams & {
  stage_id?: number; offset?: number; limit?: number; search?: string
} = {}) {
  return useQuery({
    queryKey: ['helpdesk', 'tickets', params],
    queryFn: () => api.get<{ total: number; tickets: Record<string, unknown>[] }>('/helpdesk/tickets', params),
  })
}

// --- CRM ---

export function useCRMSummary(params: DateRangeParams = {}) {
  return useQuery({
    queryKey: ['crm', 'summary', params],
    queryFn: () => api.get<{
      open_leads: number; pipeline_value: number; won_count: number; conversion_rate: number
    }>('/crm/summary', params),
  })
}

export function usePipelineByStage() {
  return useQuery({
    queryKey: ['crm', 'pipeline'],
    queryFn: () => api.get<{ stage_name: string; lead_count: number; expected_revenue: number }[]>('/crm/pipeline'),
  })
}

export function useLeadsByPeriod(params: DateRangeParams & { group_by?: string; compare_to?: string } = {}) {
  return useQuery({
    queryKey: ['crm', 'by-period', params],
    queryFn: () => api.get<{
      current: { period: string; lead_count: number; expected_revenue: number }[]
      comparison: { period: string; lead_count: number; expected_revenue: number }[] | null
    }>('/crm/by-period', params),
  })
}

export function useCRMLeads(params: DateRangeParams & {
  stage_id?: number; offset?: number; limit?: number; search?: string
} = {}) {
  return useQuery({
    queryKey: ['crm', 'leads', params],
    queryFn: () => api.get<{ total: number; leads: Record<string, unknown>[] }>('/crm/leads', params),
  })
}

// --- Projects ---

export function useProjectsSummary(params: DateRangeParams = {}) {
  return useQuery({
    queryKey: ['projects', 'summary', params],
    queryFn: () => api.get<{
      active_projects: number; open_tasks: number; completed_tasks: number; overdue_tasks: number
    }>('/projects/summary', params),
  })
}

export function useTasksByProject(params: { limit?: number } = {}) {
  return useQuery({
    queryKey: ['projects', 'tasks-by-project', params],
    queryFn: () => api.get<{ project_name: string; task_count: number }[]>('/projects/tasks-by-project', params),
  })
}

export function useTasksByPeriod(params: DateRangeParams & { group_by?: string; compare_to?: string } = {}) {
  return useQuery({
    queryKey: ['projects', 'by-period', params],
    queryFn: () => api.get<{
      current: { period: string; task_count: number }[]
      comparison: { period: string; task_count: number }[] | null
    }>('/projects/by-period', params),
  })
}

export function useProjectTasks(params: DateRangeParams & {
  project_id?: number; state?: string; offset?: number; limit?: number; search?: string
} = {}) {
  return useQuery({
    queryKey: ['projects', 'tasks', params],
    queryFn: () => api.get<{ total: number; tasks: Record<string, unknown>[] }>('/projects/tasks', params),
  })
}

// --- Customers ---

export function useCustomersSummary(params: DateRangeParams = {}) {
  return useQuery({
    queryKey: ['customers', 'summary', params],
    queryFn: () => api.get<{
      total_customers: number; active_customers: number; total_revenue: number; avg_revenue_per_customer: number
    }>('/customers/summary', params),
  })
}

export function useTopCustomersPage(params: DateRangeParams & { limit?: number } = {}) {
  return useQuery({
    queryKey: ['customers', 'top', params],
    queryFn: () => api.get<{ customer_id: number; customer_name: string; order_count: number; total_revenue: number }[]>('/customers/top', params),
  })
}

export function useCustomersByPeriod(params: DateRangeParams & { group_by?: string; compare_to?: string } = {}) {
  return useQuery({
    queryKey: ['customers', 'by-period', params],
    queryFn: () => api.get<{
      current: { period: string; customer_count: number }[]
      comparison: { period: string; customer_count: number }[] | null
    }>('/customers/by-period', params),
  })
}

export function useCustomerList(params: DateRangeParams & {
  offset?: number; limit?: number; search?: string
} = {}) {
  return useQuery({
    queryKey: ['customers', 'list', params],
    queryFn: () => api.get<{ total: number; customers: Record<string, unknown>[] }>('/customers/list', params),
  })
}

export function useCustomerDetail(customerId: number | null, params: DateRangeParams & {
  offset?: number; limit?: number
} = {}) {
  return useQuery({
    queryKey: ['customers', 'detail', customerId, params],
    queryFn: () => api.get<{
      customer: {
        id: number; name: string; email: string | null; phone: string | null
        mobile: string | null; street: string | null; street2: string | null
        city: string | null; zip: string | null; vat: string | null
        website: string | null; is_company: boolean; create_date: string | null
      }
      stats: { total_orders: number; total_revenue: number; avg_order_value: number }
      orders: { total: number; items: Record<string, unknown>[] }
    }>(`/customers/${customerId}`, params),
    enabled: !!customerId,
  })
}

// --- Sales Order Detail ---

export function useSalesOrderDetail(orderId: number | null) {
  return useQuery({
    queryKey: ['sales', 'order-detail', orderId],
    queryFn: () => api.get<{
      order: {
        id: number; name: string; state: string; date_order: string | null
        commitment_date: string | null
        amount_untaxed: number; amount_tax: number; amount_total: number
        margin: number; margin_percent: number; invoice_status: string
        note: string | null; create_date: string | null; write_date: string | null
      }
      customer: {
        id: number; name: string; email: string | null; phone: string | null
        mobile: string | null; street: string | null; city: string | null
        zip: string | null; vat: string | null; website: string | null
      }
      shipping_address: string | null
      invoice_address: string | null
      lines: {
        id: number; product_name: string | null; internal_ref: string | null
        description: string | null; qty_ordered: number; qty_delivered: number
        qty_invoiced: number; price_unit: number; discount: number
        subtotal: number; total: number; margin: number
      }[]
      invoices: {
        id: number; name: string; state: string; date: string | null
        amount_total: number; amount_due: number; payment_state: string | null
        type: string
      }[]
      deliveries: {
        id: number; name: string; state: string
        scheduled_date: string | null; date_done: string | null
      }[]
      fulfillment: {
        total_ordered: number; total_delivered: number; total_invoiced: number
        delivery_percent: number; invoice_percent: number
      }
    }>(`/sales/orders/${orderId}`),
    enabled: !!orderId,
  })
}

export function useCustomerSuggest(query: string) {
  return useQuery({
    queryKey: ['customers', 'suggest', query],
    queryFn: () => api.get<{ id: number; name: string; email: string | null; city: string | null; phone: string | null }[]>('/customers/suggest', { q: query }),
    enabled: query.length >= 2,
    staleTime: 30_000,
  })
}

// --- Inventory Product Detail ---

export function useProductDetail(productId: number | null, params: {
  offset?: number; limit?: number
} = {}) {
  return useQuery({
    queryKey: ['inventory', 'product-detail', productId, params],
    queryFn: () => api.get<{
      product: {
        id: number; name: string; default_code: string | null; type: string | null
        list_price: number; active: boolean; create_date: string | null
      }
      stock: { on_hand: number; reserved: number; available: number }
      locations: { location: string; on_hand: number; reserved: number; available: number }[]
      movements: { total: number; items: Record<string, unknown>[] }
    }>(`/inventory/products/${productId}`, params),
    enabled: !!productId,
  })
}

// --- Purchase Order Detail ---

export function usePurchaseOrderDetail(orderId: number | null) {
  return useQuery({
    queryKey: ['procurement', 'order-detail', orderId],
    queryFn: () => api.get<{
      order: {
        id: number; name: string; state: string; date_order: string | null
        date_approve: string | null; date_planned: string | null
        amount_untaxed: number; amount_tax: number; amount_total: number
        invoice_status: string; notes: string | null; create_date: string | null
      }
      vendor: { id: number; name: string; email: string | null; phone: string | null }
      lines: {
        id: number; product_name: string | null; internal_ref: string | null
        description: string | null; product_qty: number; qty_received: number
        qty_invoiced: number; price_unit: number; price_subtotal: number
        price_tax: number; price_total: number; date_planned: string | null
      }[]
    }>(`/procurement/orders/${orderId}`),
    enabled: !!orderId,
  })
}

// --- Manufacturing Order Detail ---

export function useManufacturingOrderDetail(orderId: number | null) {
  return useQuery({
    queryKey: ['manufacturing', 'order-detail', orderId],
    queryFn: () => api.get<{
      order: {
        id: number; name: string; state: string; priority: string
        product_name: string | null; product_ref: string | null
        product_qty: number; qty_producing: number; origin: string | null
        source_location: string | null; dest_location: string | null
        date_start: string | null; date_finished: string | null
        date_deadline: string | null; create_date: string | null
      }
      components: {
        id: number; product_name: string | null; internal_ref: string | null
        product_qty: number
      }[]
    }>(`/manufacturing/orders/${orderId}`),
    enabled: !!orderId,
  })
}

// --- Helpdesk Ticket Detail ---

export function useTicketDetail(ticketId: number | null) {
  return useQuery({
    queryKey: ['helpdesk', 'ticket-detail', ticketId],
    queryFn: () => api.get<{
      ticket: {
        id: number; name: string; ticket_ref: string
        partner_name: string | null; partner_email: string | null
        priority: string; kanban_state: string | null
        description: string | null; active: boolean
        stage_name: string | null; team_name: string | null
        close_date: string | null; assign_date: string | null
        sla_deadline: string | null; sla_reached: boolean | null
        rating_last_value: number | null; resolution_days: number | null
        create_date: string | null
      }
    }>(`/helpdesk/tickets/${ticketId}`),
    enabled: !!ticketId,
  })
}

// --- CRM Lead Detail ---

export function useLeadDetail(leadId: number | null) {
  return useQuery({
    queryKey: ['crm', 'lead-detail', leadId],
    queryFn: () => api.get<{
      lead: {
        id: number; name: string; type: string
        partner_name: string | null; email_from: string | null; phone: string | null
        priority: string; expected_revenue: number; prorated_revenue: number
        probability: number | null; active: boolean
        stage_name: string | null; is_won: boolean | null
        date_deadline: string | null; date_closed: string | null
        date_open: string | null; date_conversion: string | null
        city: string | null; create_date: string | null
      }
    }>(`/crm/leads/${leadId}`),
    enabled: !!leadId,
  })
}

// --- Project Task Detail ---

export function useTaskDetail(taskId: number | null) {
  return useQuery({
    queryKey: ['projects', 'task-detail', taskId],
    queryFn: () => api.get<{
      task: {
        id: number; name: string; state: string; priority: string
        active: boolean; project_name: string | null; stage_name: string | null
        date_deadline: string | null; date_assign: string | null
        date_end: string | null; date_last_stage_update: string | null
        allocated_hours: number | null; effective_hours: number | null
        overtime: number | null; progress: number | null
        create_date: string | null
      }
    }>(`/projects/tasks/${taskId}`),
    enabled: !!taskId,
  })
}

// --- Support ---

interface SupportTicketResponse {
  id: string
  subject: string
  priority: string
  created_at: string
}

export function useSubmitSupportTicket() {
  return useMutation({
    mutationFn: (formData: FormData) =>
      api.postFormData<SupportTicketResponse>('/support/tickets', formData),
  })
}

interface SupportSettings {
  support_email: string
}

export function useSupportSettings() {
  return useQuery({
    queryKey: ['support', 'settings'],
    queryFn: () => api.get<SupportSettings>('/support/settings'),
  })
}

export function useUpdateSupportSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SupportSettings) =>
      api.put<SupportSettings>('/support/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support', 'settings'] }),
  })
}

// --- User Preferences ---

export function useUserPreferences() {
  return useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => api.get<UserPreferenceResponse>('/user-preferences'),
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateUserPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<UserPreferenceResponse>) =>
      api.patch<UserPreferenceResponse>('/user-preferences', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-preferences'] }),
  })
}

// --- Saved Filters (extended) ---

export function useUpdateSavedFilter(page: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; filters?: Record<string, unknown> }) =>
      api.patch<SavedFilterResponse>(`/saved-filters/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-filters', page] }),
  })
}

export function useSetFilterDefault(page: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.patch<SavedFilterResponse>(`/saved-filters/${id}/set-default`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-filters', page] }),
  })
}

// --- Grading ---

type GradingView = 'total-stocked' | 'processed-stock'

export function useGradingOverview(view: GradingView, params: DateRangeParams) {
  return useQuery({
    queryKey: ['grading', view, 'overview', params],
    queryFn: () => api.get<GradingOverview>(`/inventory/grading/${view}/overview`, params),
    enabled: !!params.date_from && !!params.date_to,
  })
}

export function useGradingSummary(view: GradingView, params: DateRangeParams) {
  return useQuery({
    queryKey: ['grading', view, 'summary', params],
    queryFn: () => api.get<GradingSummary>(`/inventory/grading/${view}/summary`, params),
    enabled: !!params.date_from && !!params.date_to,
  })
}

export function useGradeBreakdown(view: GradingView, params: DateRangeParams) {
  return useQuery({
    queryKey: ['grading', view, 'grades', params],
    queryFn: () => api.get<GradeBreakdownItem[]>(`/inventory/grading/${view}/grades`, params),
    enabled: !!params.date_from && !!params.date_to,
  })
}

export function useDailyGradeData(view: GradingView, params: DateRangeParams) {
  return useQuery({
    queryKey: ['grading', view, 'daily-grades', params],
    queryFn: () => api.get<DailyGradeData[]>(`/inventory/grading/${view}/daily-grades`, params),
    enabled: !!params.date_from && !!params.date_to,
  })
}

export function useCategoryTotals(view: GradingView, params: DateRangeParams) {
  return useQuery({
    queryKey: ['grading', view, 'categories', params],
    queryFn: () => api.get<CategoryTotalsResponse>(`/inventory/grading/${view}/categories`, params),
    enabled: !!params.date_from && !!params.date_to,
  })
}

export function useGradingItems(view: GradingView, params: DateRangeParams & {
  search?: string; grade?: string; category?: string;
  cost_min?: number; cost_max?: number; offset?: number; limit?: number
}) {
  return useQuery({
    queryKey: ['grading', view, 'items', params],
    queryFn: () => api.get<GradingItemsResponse>(`/inventory/grading/${view}/items`, params),
  })
}
