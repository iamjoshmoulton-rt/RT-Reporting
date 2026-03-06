# RT Reporting — Deployment Guide

## Architecture

| Component | Host | URL Pattern |
|-----------|------|-------------|
| Frontend (React SPA) | **Vercel** | `https://your-app.vercel.app` |
| Backend (FastAPI) | **Railway** | `https://your-backend.up.railway.app` |
| App Database | **Railway** (PostgreSQL plugin) | Internal connection string |
| Odoo Read Replica | **AWS RDS** | Existing production replica |

---

## Step 1: Push to GitHub

```bash
cd RT_Reporting-production
git init
git add .
git commit -m "Initial commit — RT Reporting v1.0"
git remote add origin https://github.com/YOUR_ORG/rt-reporting.git
git push -u origin main
```

> Make sure `.env` is in `.gitignore` — it contains secrets.

---

## Step 2: Deploy Backend on Railway

### 2a. Create Project
1. Go to [railway.app](https://railway.app) and create a new project
2. Choose **"Deploy from GitHub repo"** and select the repo
3. Set the **Root Directory** to `backend`

### 2b. Add PostgreSQL
1. Click **"+ New"** → **"Database"** → **"PostgreSQL"**
2. This creates the app database. Railway provides a connection string automatically.

### 2c. Set Environment Variables

In the Railway service settings, add these env vars:

| Variable | Value | Notes |
|----------|-------|-------|
| `APP_DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway reference variable — auto-fills. **Change prefix** from `postgresql://` to `postgresql+asyncpg://` |
| `ODOO_DATABASE_URL` | `postgresql+asyncpg://postgres:YOUR_PASS@your-rds-host:5432/erp.refreshedtech.com` | Your AWS RDS read replica |
| `JWT_SECRET_KEY` | *(generate a new one)* | `openssl rand -base64 48` |
| `JWT_ALGORITHM` | `HS256` | |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | `7` | |
| `GOOGLE_CLIENT_ID` | *(your Google OAuth client ID)* | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | *(your Google OAuth client secret)* | From Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-BACKEND.up.railway.app/api/auth/google/callback` | Must match Google Console authorized redirect URI |
| `ALLOWED_DOMAIN` | `refreshedtech.com` | |
| `VAPID_PRIVATE_KEY` | *(your VAPID private key)* | |
| `VAPID_PUBLIC_KEY` | *(your VAPID public key)* | |
| `VAPID_CLAIM_EMAIL` | `mailto:ozzy@refreshedtech.com` | |
| `SMTP_HOST` | `smtp.gmail.com` | |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` | `reporting@refreshedtech.com` | |
| `SMTP_PASSWORD` | *(your app password)* | |
| `SMTP_FROM_NAME` | `RT Reporting` | |
| `SMTP_FROM_EMAIL` | `reporting@refreshedtech.com` | |
| `SUPERADMIN_EMAILS` | `ozzy@refreshedtech.com,josh.moulton@refreshedtech.com` | |
| `BUSINESS_TIMEZONE` | `America/New_York` | |
| `FRONTEND_URL` | `https://your-app.vercel.app` | Used for CORS and OAuth redirects. Comma-separate for multiple origins. |
| `PORT` | *(set by Railway automatically)* | Don't set manually |

### 2d. Verify
Once deployed, check: `https://YOUR-BACKEND.up.railway.app/api/health`
Expected: `{"status": "healthy", "service": "rt-reporting"}`

---

## Step 3: Deploy Frontend on Vercel

### 3a. Import Project
1. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**
2. Import the GitHub repo
3. Set **Root Directory** to `frontend`
4. Framework Preset: **Other** (vercel.json handles config)

### 3b. Set Environment Variable

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_API_URL` | `https://YOUR-BACKEND.up.railway.app/api` | Full URL to your Railway backend API |

### 3c. Deploy
Vercel auto-builds on push. The `frontend/vercel.json` handles:
- Build command: `npx vite build`
- Output: `dist`
- SPA fallback rewrites
- Asset cache headers

---

## Step 4: Update Google OAuth

In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials:

1. Edit your OAuth 2.0 Client
2. Add **Authorized redirect URI**: `https://YOUR-BACKEND.up.railway.app/api/auth/google/callback`
3. Add **Authorized JavaScript origin**: `https://your-app.vercel.app`
4. Save

---

## Step 5: Seed Data

On first deploy, the backend automatically:
- Runs Alembic migrations (`entrypoint.sh` runs `alembic upgrade head`)
- Seeds roles and permissions
- Creates superadmin account(s)

Login with Google SSO using any `@refreshedtech.com` email, or use the seeded admin.

---

## Local Development (unchanged)

```bash
docker compose up -d --force-recreate backend frontend
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- The local `.env` file is used by docker-compose
- Vite dev server proxies `/api` → backend container

---

## Environment Summary

| Env Var | Where Set | Purpose |
|---------|-----------|---------|
| `VITE_API_URL` | Vercel | Tells frontend where backend lives |
| `FRONTEND_URL` | Railway | CORS origins + OAuth redirect target |
| `GOOGLE_REDIRECT_URI` | Railway | OAuth callback URL |
| `APP_DATABASE_URL` | Railway | App DB (Railway Postgres) |
| `ODOO_DATABASE_URL` | Railway | Odoo read replica (AWS RDS) |
| All others | Railway | Auth, email, push, etc. |

---

## Custom Domain (Optional)

**Vercel**: Project Settings → Domains → Add `reports.refreshedtech.com`
**Railway**: Service Settings → Networking → Custom Domain → Add `api-reports.refreshedtech.com`

Then update:
- `VITE_API_URL` on Vercel → `https://api-reports.refreshedtech.com/api`
- `FRONTEND_URL` on Railway → `https://reports.refreshedtech.com`
- `GOOGLE_REDIRECT_URI` on Railway → `https://api-reports.refreshedtech.com/api/auth/google/callback`
- Google Console redirect URIs
