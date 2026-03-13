import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/Login'
import { AuthCallbackPage } from '@/pages/AuthCallback'
import { DashboardPage } from '@/pages/Dashboard'
import { SalesPage } from '@/pages/Sales'
import { ProcurementPage } from '@/pages/Procurement'
import { AccountingPage } from '@/pages/Accounting'
import { InventoryLayout } from '@/pages/Inventory/InventoryLayout'
import { TotalStockedPage } from '@/pages/Inventory/TotalStocked'
import { ProcessedStockedPage } from '@/pages/Inventory/ProcessedStocked'
import { StockSummaryPage } from '@/pages/Inventory/StockSummary'
import { GradingTotalStockedPage } from '@/pages/Inventory/GradingTotalStocked'
import { GradingProcessedStockPage } from '@/pages/Inventory/GradingProcessedStock'
import { AlertsPage } from '@/pages/Alerts'
import { ReportBuilderPage } from '@/pages/ReportBuilder'
import { SettingsPage } from '@/pages/Settings'
import { ManufacturingPage } from '@/pages/Manufacturing'
import { HelpdeskPage } from '@/pages/Helpdesk'
import { CRMPage } from '@/pages/CRM'
import { ProjectsPage } from '@/pages/Projects'
import { CustomersPage } from '@/pages/Customers'
import { CustomerDetailPage } from '@/pages/CustomerDetail'
import { SalesOrderDetailPage } from '@/pages/SalesOrderDetail'
import { ProductDetailPage } from '@/pages/ProductDetail'
import { PurchaseOrderDetailPage } from '@/pages/PurchaseOrderDetail'
import { ManufacturingOrderDetailPage } from '@/pages/ManufacturingOrderDetail'
import { HelpdeskTicketDetailPage } from '@/pages/HelpdeskTicketDetail'
import { CRMLeadDetailPage } from '@/pages/CRMLeadDetail'
import { ProjectTaskDetailPage } from '@/pages/ProjectTaskDetail'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { LandingRedirect } from '@/components/layout/LandingRedirect'
import SalesDashboard from '@/pages/SalesDashboard'
import ProcurementDashboard from '@/pages/ProcurementDashboard'
import EcommerceInvoice from '@/pages/EcommerceInvoice'
import EcommerceOrder from '@/pages/EcommerceOrder'
import PricingHistory from '@/pages/PricingHistory'
import PricingHistorySO from '@/pages/PricingHistorySO'
import SalesMargin from '@/pages/SalesMargin'
import TradeIn from '@/pages/TradeIn'
import AccountingDash from '@/pages/AccountingDash'
import OperationsProcessing from '@/pages/OperationsProcessing'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30 * 1000,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<LandingRedirect />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/sales-dashboard" element={<SalesDashboard />} />
              <Route path="/sales" element={<SalesPage />} />
              <Route path="/sales/orders/:id" element={<SalesOrderDetailPage />} />
              <Route path="/procurement-dashboard" element={<ProcurementDashboard />} />
              <Route path="/procurement" element={<ProcurementPage />} />
              <Route path="/procurement/orders/:id" element={<PurchaseOrderDetailPage />} />
              <Route path="/accounting" element={<AccountingPage />} />
              <Route path="/inventory" element={<InventoryLayout />}>
                <Route index element={<Navigate to="total-stocked" replace />} />
                <Route path="total-stocked" element={<GradingTotalStockedPage />} />
                <Route path="processed-stocked" element={<GradingProcessedStockPage />} />
                <Route path="stock-levels" element={<TotalStockedPage />} />
                <Route path="movements" element={<ProcessedStockedPage />} />
                <Route path="stock-summary" element={<StockSummaryPage />} />
              </Route>
              <Route path="/inventory/products/:id" element={<ProductDetailPage />} />
              <Route path="/manufacturing" element={<ManufacturingPage />} />
              <Route path="/manufacturing/orders/:id" element={<ManufacturingOrderDetailPage />} />
              <Route path="/helpdesk" element={<HelpdeskPage />} />
              <Route path="/helpdesk/tickets/:id" element={<HelpdeskTicketDetailPage />} />
              <Route path="/crm" element={<CRMPage />} />
              <Route path="/crm/leads/:id" element={<CRMLeadDetailPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/tasks/:id" element={<ProjectTaskDetailPage />} />
              <Route path="/ecommerce-invoice" element={<EcommerceInvoice />} />
              <Route path="/ecommerce-order" element={<EcommerceOrder />} />
              <Route path="/pricing-history" element={<PricingHistory />} />
              <Route path="/pricing-history-so" element={<PricingHistorySO />} />
              <Route path="/sales-margin" element={<SalesMargin />} />
              <Route path="/trade-in" element={<TradeIn />} />
              <Route path="/accounting-dash" element={<AccountingDash />} />
              <Route path="/operations-processing" element={<OperationsProcessing />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/report-builder" element={<ReportBuilderPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  )
}

export default App
