# RT Reporting

Business intelligence and reporting platform for Refreshed Tech, powered by Odoo v17 PostgreSQL read replica.

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy 2.0, asyncpg, JWT + Google SSO, APScheduler
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Apache ECharts
- **Database**: PostgreSQL (Odoo read replica + app DB)
- **Deployment**: Docker + docker-compose
- **Mobile**: PWA (installable), Web Push notifications

## Features

- **Dashboard**: KPI cards, revenue trends, top customers/products
- **Sales Reports**: Revenue by period, customer breakdown, order tables with period comparison
- **Procurement Reports**: Spend tracking, vendor analysis, purchase order tables
- **Accounting Reports**: Invoice tracking, AR/AP aging, receivable/payable charts
- **Inventory Reports**: Stock levels, warehouse distribution, movement tracking
- **Report Builder**: Create custom reports from Odoo data with drag-and-drop columns, filters, and aggregations
- **Smart Alerts**: Threshold-based alerts with email and push notification delivery
- **Annotations**: Add notes to dates on any report for team context
- **Scheduled Reports**: Periodic email reports with rich HTML body and Excel/PDF attachments
- **Export**: CSV and Excel export for all report types
- **Custom Dashboards**: Drag-and-drop widget layout (coming)
- **Saved Filters**: Save and reuse filter presets per page
- **Auto-refresh**: Configurable live data refresh (30s, 1m, 5m, 15m)
- **Dark/Light Mode**: Full theme support with Refreshed Tech brand colors
- **Mobile PWA**: Add to home screen, responsive layouts, push notifications

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Google Cloud OAuth2 credentials (for SSO)
- Odoo v17 PostgreSQL read replica connection string

### Setup

1. Copy environment config:
   ```bash
   cp backend/.env.example backend/.env
   ```

2. Edit `backend/.env` with your credentials:
   - `ODOO_DATABASE_URL` - your AWS read replica connection string
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - from Google Cloud Console
   - `JWT_SECRET_KEY` - generate a secure random key
   - `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` - for push notifications (generate with `npx web-push generate-vapid-keys`)
   - `SMTP_*` - SMTP server for scheduled email reports

3. Start all services (development):
   ```bash
   docker compose up --build
   ```

4. Start all services (production):
   ```bash
   docker compose -f docker-compose.prod.yml up --build -d
   ```

5. Access the app:
   - **Dev Frontend**: http://localhost:5173
   - **Prod Frontend**: http://localhost (port 80)
   - **Backend API**: http://localhost:8000
   - **API Docs**: http://localhost:8000/docs

### Development (without Docker)

**Backend:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
RT_Reporting/
├── backend/                # FastAPI backend
│   ├── app/
│   │   ├── auth/           # Google SSO, JWT, RBAC, permissions
│   │   ├── odoo_models/    # SQLAlchemy Odoo table mappings
│   │   ├── routers/        # API endpoints
│   │   │   ├── dashboard.py
│   │   │   ├── sales.py
│   │   │   ├── procurement.py
│   │   │   ├── accounting.py
│   │   │   ├── inventory.py
│   │   │   ├── export.py          # CSV/Excel exports
│   │   │   ├── custom_dashboard.py
│   │   │   ├── report_builder.py
│   │   │   ├── alerts.py          # Smart alerts
│   │   │   ├── annotations.py
│   │   │   ├── saved_filters.py
│   │   │   ├── scheduled_reports.py
│   │   │   └── push.py           # Web Push notifications
│   │   ├── services/       # Business logic
│   │   ├── email/          # Email sender + Jinja2 templates
│   │   └── scheduler/      # APScheduler for periodic reports
│   ├── alembic/            # Database migrations
│   ├── Dockerfile          # Dev Dockerfile
│   └── Dockerfile.prod     # Production Dockerfile (multi-worker)
├── frontend/               # React + Vite frontend
│   ├── src/
│   │   ├── api/            # API client + React Query hooks
│   │   ├── components/     # UI components, charts, layout
│   │   ├── pages/          # Route pages
│   │   └── hooks/          # Custom hooks (auth, theme, push, auto-refresh)
│   ├── public/             # PWA assets + service worker
│   ├── Dockerfile          # Dev Dockerfile
│   ├── Dockerfile.prod     # Production Dockerfile (Nginx)
│   └── nginx.conf          # Nginx config with API proxy
├── docker-compose.yml      # Development compose
└── docker-compose.prod.yml # Production compose
```

## Authentication

- **Primary**: Google SSO (restricted to @refreshedtech.com)
- **Fallback**: Username/password for service accounts
- **API**: API key authentication for external integrations

## Permissions

Element-level RBAC controls visibility down to individual charts, tables, and buttons.
Default roles: Admin, Analyst, Viewer. Custom roles supported.

## Push Notifications

1. Generate VAPID keys: `npx web-push generate-vapid-keys`
2. Add to `backend/.env`: `VAPID_PRIVATE_KEY` and `VAPID_PUBLIC_KEY`
3. Users enable notifications in Settings page
4. Alerts and events trigger native push notifications on subscribed devices

## Scheduled Reports

Configure via Settings page (admin only):
- Choose report type (Summary, Sales, Procurement, Accounting, Inventory)
- Set schedule (daily, weekly, monthly, custom cron)
- Add recipient email addresses
- Choose attachment format (Excel, PDF, or both)
- Test with one-click test send
