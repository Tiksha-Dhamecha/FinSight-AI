# FinSight AI

SME-focused **financial visibility** app: token-authenticated users record or import transactions, then explore analytics, cash flow, operations, executive reports, and a live business health dashboard backed by a Django REST API and SQLite.

---

## Overview

FinSight AI helps small and medium businesses **centralize ledger-style transactions** (revenue and expenses), then **derive KPIs**—totals, trends, margins, cash movement, anomalies, and narrative-style reports—so owners can see profitability and liquidity without maintaining a separate BI stack.

---

## Problem Statement

Many SMEs track money across spreadsheets, bank exports, and ad hoc notes. That makes it hard to answer simple questions consistently: *Are we profitable this quarter? Is cash movement healthy? Where is spend concentrated?* FinSight provides a single place to **store** transactions and **recompute** metrics on demand for a selected period.

---

## Solution Summary

- **Backend:** Django + Django REST Framework, **token authentication**, SQLite database, domain logic in service modules (`analytics_service`, `cash_flow_service`, `reports_service`, `operations_service`).
- **Frontend:** Static HTML/CSS (Tailwind via CDN) and vanilla JavaScript pages under `frontend/stitch_landing_login/`, served with Python’s `http.server` (see `serve.ps1`). The UI calls JSON APIs under `/api/`.

---

## Features / Modules

| Area | Description |
|------|-------------|
| **Authentication** | Sign up, login, logout; token stored in `localStorage`; `/api/auth/me/` for current user. |
| **Transactions** | CRUD-style transaction list, manual entry, **bulk CSV/JSON import** via `POST .../transactions/bulk_import/`. |
| **Dashboard** | Business health score, KPIs (revenue, expenses, net profit, **operating margin**, cash flow), period filters (last 6 months, YTD, custom range). |
| **Analytics** | Trends, allocation, anomalies, KPIs for selected range. |
| **Cash flow & liquidity** | Monthly inflow/outflow, net by month, receivables/payables-style open balances, runway-style signals. |
| **Operational performance** | Operational metrics from the same transaction store (filters align with analytics). |
| **Reports** | Executive-style report composed from analytics + cash flow (EBITDA-style proxy, recommendations). |
| **Anomalies** | Highlights driven from analytics anomaly detection. |
| **Settings / onboarding** | Onboarding/settings UI shell (`business_setup_onboarding`). |

Some UI labels (e.g. “Export PDF” on analytics) may be **presentational**; wire-up varies—always verify in the browser.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python, **Django** 5.x (see `requirements.txt`), **Django REST Framework**, `django-cors-headers` |
| Auth | `rest_framework.authtoken` |
| Database | **SQLite** (`backend/db.sqlite3`) |
| Frontend | Static HTML, **Tailwind CSS** (CDN), **vanilla JavaScript**; INR formatting via `inr-format.js` |
| Charts | CSS-based bars / SVG; no heavy chart library required |

---

## Project Structure

```
FinSight-AI/
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── db.sqlite3                 # created after migrate
│   ├── config/                    # Django project (settings, urls, wsgi)
│   ├── accounts/                  # User model, auth API (signup, login, logout, me)
│   └── transactions/              # Transaction model, ViewSet, services
│       ├── analytics_service.py
│       ├── cash_flow_service.py
│       ├── reports_service.py
│       ├── operations_service.py
│       ├── views.py
│       ├── serializers.py
│       └── models.py
├── frontend/
│   └── stitch_landing_login/
│       ├── serve.ps1              # optional: free port 8080, start static server
│       ├── js/
│       │   ├── config.js          # API origin (e.g. 127.0.0.1:8000)
│       │   ├── auth.js
│       │   ├── auth-guard.js
│       │   ├── dashboard-page.js
│       │   ├── transactions-page.js
│       │   ├── analytics-trends-page.js
│       │   ├── cash-flow-page.js
│       │   ├── operations-page.js
│       │   ├── reports-page.js
│       │   └── ...
│       ├── landing_login/         # login / signup entry
│       ├── main_health_dashboard/ # dashboard
│       ├── data_entry_import/     # transactions + import
│       ├── financial_analytics_trends/
│       ├── cash_flow_liquidity/
│       ├── operational_performance/
│       ├── financial_atelier_executive_dashboard/  # reports
│       ├── anomalies_recommendations/
│       └── business_setup_onboarding/
└── README.md
```

---

## Setup Instructions

### Prerequisites

- Python **3.10+** recommended  
- `pip` for dependencies  

### Backend (Django API)

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

The API base is **`http://127.0.0.1:8000`**. Routes include:

- `POST /api/auth/signup/`, `POST /api/auth/login/`, `POST /api/auth/logout/`, `GET /api/auth/me/`
- `GET/POST /api/transactions/` (ViewSet), `POST /api/transactions/bulk_import/`
- `GET /api/transactions/analytics/` (query: `range`, optional `start_date`, `end_date`)
- `GET /api/transactions/cash-flow/`, `GET /api/transactions/reports/`, `GET /api/transactions/operations/`

### Frontend (static site)

The frontend does **not** use npm for the main flow; it is a folder of static files.

```powershell
cd frontend\stitch_landing_login
.\serve.ps1 -StopExisting
```

Or manually (PowerShell):

```powershell
cd frontend\stitch_landing_login
python -m http.server 8080 --bind 127.0.0.1
```

Open **`http://127.0.0.1:8080/landing_login/code.html`**.

Using **`127.0.0.1`** (not only `localhost`) avoids common Windows DNS/API mismatches with the backend origin.

---

## Environment / Configuration

- **`frontend/stitch_landing_login/js/config.js`** — sets `window.FINSIGHT_API_ORIGIN` (defaults to `http://127.0.0.1:8000`). Adjust if the API runs elsewhere.
- **CORS** — `backend/config/settings.py` lists allowed origins (e.g. `http://127.0.0.1:8080`). Add your dev origin if you change ports.
- **Database** — SQLite path is `backend/db.sqlite3` (relative to `manage.py`).
- **Security** — `SECRET_KEY` in settings is dev-only; replace for production.

---

## Data Flow (high level)

1. User **signs up** or **logs in** → receives an **auth token** stored in the browser.
2. User **creates** transactions in the UI or **import**s rows → backend persists rows in SQLite per user.
3. **Dashboard / analytics / cash flow / reports / operations** call GET endpoints with a **date range** preset; services aggregate **transactions** in range (and prior window where relevant) and return JSON.
4. **Frontend** binds numbers and narratives to cards and charts (no second source of truth for business rules).

---

## Usage Guide

1. **Start** backend and frontend (see above).
2. **Register** or **log in** at `/landing_login/code.html`.
3. **Add or import** transactions (`data_entry_import` / `transactions` module).
4. Open the **Dashboard** (`main_health_dashboard/code.html`) — set **Last 6 months**, **YTD**, or **Custom range** as needed.
5. Explore **Analytics**, **Cash flow**, **Operations**, **Reports**, and **Anomalies** from the nav.

---

## Development Notes

- **Token header:** `Authorization: Token <key>` (see `auth.js`).
- **Currency display:** INR formatting is client-side for presentation.
- **Tests:** `backend/transactions/tests.py` exists; run `python manage.py test` from `backend/` if desired.

---

## License / Attribution

Add your license and credits here. This README describes the repository as implemented; adjust if your fork differs.
