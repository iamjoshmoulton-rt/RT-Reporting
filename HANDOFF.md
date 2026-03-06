# RT Reporting — Session Handoff

## What Is This Project?
A comprehensive business reporting dashboard that reads from an Odoo 17 read-replica (AWS RDS). Built so teams never need to hit Odoo production for data. The read replica syncs in real-time.

## Architecture
- **Backend**: Python FastAPI + SQLAlchemy 2.0 (async) + asyncpg on port 8000
- **Frontend**: React 19 + Vite + TypeScript + TanStack Query/Table + ECharts + react-grid-layout on port 5173
- **Databases**: App DB (rt_reporting, local postgres) + Odoo DB (read-only AWS RDS replica)
- **Deployment**: Docker Compose — `docker compose up -d --force-recreate backend frontend`
- **Login**: `ozzy@refreshedtech.com` / `admin123`

## What's Built (Phases 1-4 COMPLETE)

### 13 Module Pages
Sales, Procurement, Accounting, Inventory (3 sub-pages: Total Stocked, Processed Stocked, Stock Summary), Manufacturing, Helpdesk, CRM, Projects, Customers, Quality

### 8 Detail Pages (all with rich UI)
| Page | Route | Key Features |
|------|-------|-------------|
| Customer | `/customers/:id` | Order history, spend metrics |
| Sales Order | `/sales/orders/:id` | Financial KPIs, fulfillment progress, invoices, deliveries, addresses |
| Product | `/inventory/products/:id` | Stock levels, sales history |
| Purchase Order | `/procurement/orders/:id` | Fulfillment progress bars, vendor info, key dates |
| Manufacturing Order | `/manufacturing/orders/:id` | Production progress, BOM components, locations |
| Helpdesk Ticket | `/helpdesk/tickets/:id` | Ticket timeline, SLA status, priority badges |
| CRM Lead | `/crm/leads/:id` | Win probability bar, revenue metrics, won badge |
| Project Task | `/projects/tasks/:id` | Task + time budget progress bars, overtime alerts |

### Support Pages
- **Dashboard**: Drag-and-drop widget grid, widgets for all modules, accent-colored KPI cards
- **Report Builder**: Multi-table joins (16 join paths), save/load queries, export to CSV/Excel/PDF
- **Alerts**: Smart alert rules with 7+ metrics, email notifications
- **Settings**: User management, roles/permissions, scheduled reports CRUD

### Cross-Cutting Features
- Date range presets (10 options) on all module pages
- PDF/CSV/Excel export on all data tables
- Smart typeahead search on Customers page
- Permission-gated components (PermissionGate)
- Dark mode support
- Comparison charts (previous period / previous year)

## Key File Locations

### Backend
```
backend/app/
├── routers/          # FastAPI route handlers (one per module)
├── services/         # Business logic + SQL queries (one per module)
├── odoo_models/      # SQLAlchemy ORM models for Odoo tables
├── auth/             # JWT auth, permissions, dependencies
├── database.py       # DB connection setup
└── main.py           # FastAPI app entry point
```

### Frontend
```
frontend/src/
├── pages/            # Page components (one per route)
├── components/
│   ├── ui/           # KpiCard, StatusBadge, DateRangeFilter, SearchWithSuggestions, ExportMenu, PermissionGate
│   ├── charts/       # RevenueChart, ComparisonChart, TopItemsChart
│   ├── tables/       # DataTable (TanStack Table wrapper)
│   ├── layout/       # AppLayout, Sidebar, ProtectedRoute
│   └── settings/     # Settings sub-panels
├── api/
│   └── hooks.ts      # All TanStack Query hooks + API client
├── lib/utils.ts      # formatCurrency, formatNumber, cn()
└── App.tsx           # Route definitions
```

## Technical Gotchas
1. **JSONB product names**: Odoo stores as `{"en_US": "Name"}` — extract via `ProductTemplate.name["en_US"].as_string()`
2. **invoice_origin matching**: Use `ILIKE` with `%name%` — Odoo stores comma-separated order names
3. **Route ordering**: Specific paths (`/suggest`) must come before parameterized (`/{customer_id}`) in FastAPI routers
4. **Aliased joins**: Use `aliased(ResPartner)` for self-joins (shipping/invoice addresses)
5. **KpiCard accent**: Pass `accent="#hex"` for colored top bar + tinted icon background
6. **HTML notes**: Use `dangerouslySetInnerHTML` — Odoo stores notes as HTML
7. **CSS font import warning**: Cosmetic only, non-blocking

## What's Left (Potential Phase 5)

### Alert Metrics for New Modules
Backend `alert_service.py` currently has 7 metrics (sales, procurement, accounting, inventory). Need to add:
- `manufacturing.active_mos` — Count of active manufacturing orders
- `helpdesk.open_tickets` — Count of open helpdesk tickets
- `crm.pipeline_value` — Total pipeline value
- `crm.open_leads` — Count of open leads
- `projects.overdue_tasks` — Count of overdue tasks

### Scheduled Reports Frontend
Backend has `scheduled_reports.py` router and Settings has basic CRUD. Enhance to:
- Link scheduled reports to saved Report Builder queries
- Add "Schedule this report" button on Report Builder
- Show next scheduled run time and last delivery status

### Any New User Requests
The user may have additional feedback after reviewing the enhanced detail pages, or new feature ideas.

## Last Session Summary
Enhanced all 5 remaining detail pages (PO, MO, Ticket, Lead, Task) to match the SalesOrderDetail quality level with:
- Accent-colored header bars (dynamic based on context)
- Accent-colored KPI cards
- Progress bars (fulfillment, production, probability, task completion, time budget)
- SectionCard components with icon headers
- Color-coded status badges and priority indicators
- HTML content rendering
- Timeline visualizations (helpdesk)
- Dynamic badges (overdue, urgent, won)

All verified working with live data. Frontend rebuilt and running.
