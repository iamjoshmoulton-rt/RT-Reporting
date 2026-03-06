# RT Reporting — Project Takeover Checklist

## Overview
This document lists every piece of access, credential, and service needed to fully operate and maintain the RT Reporting system. **Nothing runs without these.**

---

## 1. Environment Secrets (.env file)
> The entire backend depends on a `.env` file that is NOT in the repo. Need the complete file or each value individually.

| Variable | Purpose | Who Has It? | Status |
|----------|---------|-------------|--------|
| `APP_DATABASE_URL` | App database connection string | | [ ] |
| `ODOO_DATABASE_URL` | Odoo read replica connection string | | [ ] |
| `JWT_SECRET_KEY` | Signs all auth tokens — if changed, logs everyone out | | [ ] |
| `JWT_ALGORITHM` | Should be HS256 | | [ ] |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime | | [ ] |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime | | [ ] |
| `GOOGLE_CLIENT_ID` | Google OAuth app ID | | [ ] |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | | [ ] |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL | | [ ] |
| `ALLOWED_DOMAIN` | Should be refreshedtech.com | | [ ] |
| `VAPID_PRIVATE_KEY` | Web push notification signing key | | [ ] |
| `VAPID_PUBLIC_KEY` | Web push public key | | [ ] |
| `VAPID_CLAIM_EMAIL` | Push notification contact email | | [ ] |
| `SMTP_HOST` | Email server (likely smtp.gmail.com) | | [ ] |
| `SMTP_PORT` | Email port (likely 587) | | [ ] |
| `SMTP_USER` | Email account for sending reports | | [ ] |
| `SMTP_PASSWORD` | Email app password | | [ ] |
| `SMTP_FROM_NAME` | Display name on emails | | [ ] |
| `SMTP_FROM_EMAIL` | From address on emails | | [ ] |
| `FRONTEND_URL` | Production frontend URL | | [ ] |
| `BUSINESS_TIMEZONE` | Likely America/New_York | | [ ] |
| `BUDGET_KPI_MAPPING` | JSON mapping for budget vs actuals | | [ ] |

---

## 2. Infrastructure Access

### Hostinger VPS (where it's deployed)
| Item | Detail | Status |
|------|--------|--------|
| VPS IP address | | [ ] |
| SSH username | | [ ] |
| SSH private key or password | | [ ] |
| SSH port (likely 22) | | [ ] |
| Hostinger account login | For billing, DNS, server management | [ ] |
| Project path on server | Where the code lives on the VPS | [ ] |

### AWS (Odoo Read Replica)
| Item | Detail | Status |
|------|--------|--------|
| AWS account access | Console login or IAM credentials | [ ] |
| RDS instance identifier | Which database instance | [ ] |
| RDS endpoint/hostname | Connection hostname | [ ] |
| Database name | Likely `odoo_db` or similar | [ ] |
| Read-only user credentials | `odoo_reader` user + password | [ ] |
| VPC/Security group config | What IPs can connect | [ ] |

### Domain & DNS
| Item | Detail | Status |
|------|--------|--------|
| Domain name | Where the app is hosted | [ ] |
| DNS provider | Hostinger, Cloudflare, etc. | [ ] |
| DNS login credentials | To manage records | [ ] |
| SSL certificate status | Auto-renewing via Certbot? | [ ] |

---

## 3. Third-Party Service Access

### Google Cloud Console (OAuth)
| Item | Detail | Status |
|------|--------|--------|
| Google Cloud project name | | [ ] |
| Google Cloud Console access | Need Owner or Editor role | [ ] |
| OAuth consent screen config | Authorized domains, scopes | [ ] |
| OAuth client ID management | To rotate secrets if needed | [ ] |

### GitHub Repository
| Item | Detail | Status |
|------|--------|--------|
| Repo URL | | [ ] |
| Admin/write access to repo | | [ ] |
| GitHub Actions secrets | HOST, USERNAME, SSH_PRIVATE_KEY, SSH_PORT, PROJECT_PATH | [ ] |
| Branch protection rules | What's configured on `production` branch | [ ] |

### SMTP / Email
| Item | Detail | Status |
|------|--------|--------|
| Email account access | reports@refreshedtech.com (or whatever sends reports) | [ ] |
| App password management | Where to rotate the SMTP password | [ ] |
| Google Workspace admin | If using Gmail, need admin to manage app passwords | [ ] |

---

## 4. Database State Verification

Once you have access, verify these:

- [ ] Run `alembic current` on the production backend to check migration state
- [ ] Compare the `alembic/versions/` migration against actual production schema
- [ ] Confirm Odoo read replica is actually read-only (no write permissions)
- [ ] Check if any manual schema changes were made outside of Alembic
- [ ] Export the current `users` and `roles` tables to understand who has access
- [ ] Verify `app_settings` table for any custom configuration

---

## 5. Operational Knowledge

Questions to ask the current developer:

- [ ] What's the typical deployment process? Just push to `production` branch?
- [ ] Are there any cron jobs or scheduled tasks outside of the app (on the VPS itself)?
- [ ] Has the Odoo schema ever changed and required updates to `odoo_models/`?
- [ ] Are there any known bugs or workarounds currently in place?
- [ ] What monitoring exists? Any uptime checks, error alerting?
- [ ] How is the AWS read replica kept in sync? Automatic replication?
- [ ] Has the VPS ever run out of disk/memory? What are the resource limits?
- [ ] Are there any manual database queries that get run periodically?
- [ ] Who are the current Admin users in the system?
- [ ] Are there any API keys in use by external systems?

---

## 6. Risk Items if Handoff is Incomplete

| Risk | Impact | Mitigation |
|------|--------|------------|
| Lost JWT secret | All users logged out, tokens invalid | Get the secret or plan a coordinated reset |
| Lost Google OAuth creds | Nobody can log in via SSO | Get Cloud Console access to regenerate |
| Lost SMTP password | Scheduled reports and alerts stop sending | Get email account access |
| Lost VPS access | Can't deploy, debug, or maintain | Get Hostinger account access |
| Lost AWS access | Can't manage the Odoo read replica | Get IAM access or RDS credentials |
| Odoo upgrades break models | Reports show wrong/no data | Document current Odoo version + schema |
| No monitoring | Outages go unnoticed | Set up UptimeRobot or similar immediately |

---

## 7. First Things to Do After Getting Access

1. **Secure your own access** — add your SSH key, get added to Google Cloud, get GitHub admin
2. **Back up the `.env` file** — store securely (1Password, Vault, etc.)
3. **Back up the production app database** — `pg_dump` the app DB
4. **Verify the deployment pipeline** — make a trivial change, push, confirm it deploys
5. **Set up basic monitoring** — UptimeRobot for the URL, email alerts for downtime
6. **Add logging** — even basic Python logging to stdout/Docker logs
7. **Add tests** — start with the critical path: auth flow, sales KPIs, export
8. **Document the current state** — screenshot the running app, note what's working
9. **Rotate secrets** — once you have control, change JWT secret, API keys, passwords
10. **Set up your own local dev environment** — `docker compose up` with your `.env`
