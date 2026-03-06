export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface UserResponse {
  id: string
  email: string
  full_name: string
  picture_url: string | null
  is_active: boolean
  is_superadmin: boolean
  auth_provider: string
  created_at: string
  roles: RoleResponse[]
}

export interface RoleResponse {
  id: string
  name: string
  description: string | null
  is_system: boolean
  permissions: PermissionResponse[]
}

export interface PermissionResponse {
  id: string
  resource: string
  action: 'view' | 'export' | 'manage'
}

export interface UserPermissionsResponse {
  permissions: PermissionResponse[]
  is_superadmin: boolean
}

export interface SalesSummary {
  total_orders: number
  total_revenue: number
  total_untaxed: number
  total_tax: number
  avg_order_value: number
}

export interface PeriodData {
  period: string
  order_count: number
  revenue: number
  untaxed: number
}

export interface CustomerData {
  partner_id: number
  customer_name: string
  order_count: number
  total_revenue: number
}

export interface ProductData {
  product_id: number
  product_name: string
  qty_sold: number
  total_revenue: number
}

export interface DashboardSummary {
  sales: SalesSummary
  procurement: {
    total_orders: number
    total_spend: number
    total_untaxed: number
    avg_order_value: number
  }
  accounting: {
    invoices: { count: number; total: number; outstanding: number }
    bills: { count: number; total: number; outstanding: number }
    net_revenue: number
  }
  inventory: {
    unique_products: number
    total_quantity: number
    total_reserved: number
    available_quantity: number
  }
  trends?: {
    total_revenue: number | null
    avg_order_value: number | null
    net_revenue: number | null
    total_spend: number | null
    invoices_outstanding: number | null
  }
}

export interface AgingData {
  current: number
  days_1_30: number
  days_31_60: number
  days_61_90: number
  days_90_plus: number
}

export interface PaginatedResponse<T> {
  total: number
  [key: string]: T[] | number
}

// --- Custom dashboards ---

export interface LayoutWidget {
  i: string
  x: number
  y: number
  w: number
  h: number
  widget_type: string
  config: Record<string, unknown>
}

export interface DashboardLayoutResponse {
  id: string
  name: string
  layout: LayoutWidget[]
  is_default: boolean
  created_at: string
  updated_at: string
}

// --- User Preferences ---

export interface UserPreferenceResponse {
  timezone: string | null
  default_date_range: string | null
  default_group_by: string | null
  landing_page: string | null
  theme: string | null
  auto_refresh_interval: number | null
  module_defaults: Record<string, { date_range?: string; group_by?: string }>
}

export interface SavedFilterResponse {
  id: string
  page: string
  name: string
  filters: Record<string, unknown>
  is_default: boolean
  created_at: string
}

// --- Grading ---

export interface GradingSummary {
  total_items: number
  daily_average: number
  total_value: number
  unique_products: number
  trends: {
    total_items: number | null
    daily_average: number | null
    total_value: number | null
    unique_products: number | null
  }
}

export interface GradeBreakdownItem {
  grade: string
  key: string
  count: number
  percentage: number
}

export interface DailyGradeData {
  date: string
  A: number
  B: number
  C: number
  D: number
  F: number
  new_in_box: number
  new_open_box: number
}

export interface CategoryTotal {
  category: string
  total_qty: number
  total_value: number
  A: number
  B: number
  C: number
  D: number
  F: number
  new_in_box: number
  new_open_box: number
}

export interface CategoryTotalsResponse {
  items: CategoryTotal[]
  grand_total: CategoryTotal
}

export interface GradingItem {
  id: number
  date: string | null
  uid: string | null
  product: string | null
  default_code: string | null
  category: string | null
  grade: string | null
  cost: number
}

export interface GradingItemsResponse {
  total: number
  items: GradingItem[]
}

export interface GradingOverview {
  summary: GradingSummary
  grades: GradeBreakdownItem[]
  daily_grades: DailyGradeData[]
  categories: CategoryTotalsResponse
}
