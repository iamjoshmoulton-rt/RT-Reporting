import { useState } from 'react'
import { useDateFilterState } from '@/hooks/useDateFilterState'
import { Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Users, UserCheck, DollarSign, TrendingUp } from 'lucide-react'
import { KpiCard } from '@/components/ui/KpiCard'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { PermissionGate } from '@/components/ui/PermissionGate'
import { ComparisonChart } from '@/components/charts/ComparisonChart'
import { TopItemsChart } from '@/components/charts/TopItemsChart'
import { DataTable } from '@/components/tables/DataTable'
import { SearchWithSuggestions } from '@/components/ui/SearchWithSuggestions'
import {
  useCustomersSummary, useCustomersByPeriod,
  useTopCustomersPage, useCustomerList,
} from '@/api/hooks'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { ExportMenu } from '@/components/ui/ExportMenu'
import { SavedFilterBar } from '@/components/ui/SavedFilterBar'


interface CustomerRow {
  id: number; name: string; email: string | null; phone: string | null
  city: string | null; order_count: number; total_spend: number
  create_date: string | null
}

const customerColumns: ColumnDef<CustomerRow, unknown>[] = [
  { accessorKey: 'name', header: 'Customer', cell: ({ row, getValue }) => <Link to={`/customers/${row.original.id}`} className="font-normal text-primary hover:underline">{getValue() as string}</Link> },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'phone', header: 'Phone' },
  { accessorKey: 'city', header: 'City' },
  { accessorKey: 'order_count', header: 'Orders', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'total_spend', header: 'Total Spend', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'create_date', header: 'Since', cell: ({ getValue }) => { const v = getValue() as string; return v ? new Date(v).toLocaleDateString() : '-' } },
]

export function CustomersPage() {
  const { dateFrom, dateTo, groupBy, compareTo, setDateFrom, setDateTo, setGroupBy, setCompareTo } = useDateFilterState('customers')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const pageSize = 20

  const params = { date_from: dateFrom, date_to: dateTo }
  const { data: summary } = useCustomersSummary(params)
  const { data: byPeriod } = useCustomersByPeriod({ ...params, group_by: groupBy, compare_to: compareTo || undefined })
  const { data: topCustomers } = useTopCustomersPage(params)
  const { data: customersData, isLoading: customersLoading } = useCustomerList({ ...params, offset: page * pageSize, limit: pageSize, search: search || undefined })

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="space-y-3">
        <DateRangeFilter
          dateFrom={dateFrom} dateTo={dateTo}
          onDateFromChange={setDateFrom} onDateToChange={setDateTo}
          groupBy={groupBy} onGroupByChange={setGroupBy}
          compareTo={compareTo} onCompareToChange={setCompareTo}
        />
        <SavedFilterBar
          pageName="customers"
          currentFilters={{ date_from: dateFrom, date_to: dateTo, group_by: groupBy, compare_to: compareTo }}
          onApplyFilter={(f) => { setDateFrom(f.date_from as string); setDateTo(f.date_to as string); setGroupBy(f.group_by as string); setCompareTo((f.compare_to as string) || '') }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PermissionGate resource="customers.summary">
          <KpiCard title="Total Customers" value={formatNumber(summary?.total_customers ?? 0)} icon={Users} />
        </PermissionGate>
        <PermissionGate resource="customers.summary">
          <KpiCard title="Active Customers" value={formatNumber(summary?.active_customers ?? 0)} icon={UserCheck} />
        </PermissionGate>
        <PermissionGate resource="customers.summary">
          <KpiCard title="Total Revenue" value={formatCurrency(summary?.total_revenue ?? 0)} icon={DollarSign} />
        </PermissionGate>
        <PermissionGate resource="customers.summary">
          <KpiCard title="Avg Rev / Customer" value={formatCurrency(summary?.avg_revenue_per_customer ?? 0)} icon={TrendingUp} />
        </PermissionGate>
      </div>

      <PermissionGate resource="customers.top_customers">
        {topCustomers && (
          <TopItemsChart
            title="Top Customers by Revenue"
            data={topCustomers.map(c => ({ name: c.customer_name, value: c.total_revenue }))}
          />
        )}
      </PermissionGate>

      <PermissionGate resource="customers.customers_chart">
        {byPeriod && (
          <ComparisonChart
            title="New Customers by Period"
            currentData={byPeriod.current.map(d => ({ period: d.period, value: d.customer_count }))}
            comparisonData={byPeriod.comparison?.map(d => ({ period: d.period, value: d.customer_count }))}
            valueLabel="New Customers"
          />
        )}
      </PermissionGate>

      <PermissionGate resource="customers.customer_table">
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-xl font-heading font-bold text-[var(--foreground)]">Customer List</h2>
            <div className="flex items-center gap-3">
              <SearchWithSuggestions
                value={search}
                onChange={(v) => { setSearch(v); setPage(0) }}
                placeholder="Search customers…"
              />
              <ExportMenu module="customers" dateFrom={dateFrom} dateTo={dateTo} />
            </div>
          </div>
          <DataTable
            data={(customersData?.customers ?? []) as unknown as CustomerRow[]}
            columns={customerColumns}
            total={customersData?.total}
            pageSize={pageSize}
            page={page}
            onPageChange={setPage}
            isLoading={customersLoading}
            serverPagination
          />
        </div>
      </PermissionGate>
    </div>
  )
}
