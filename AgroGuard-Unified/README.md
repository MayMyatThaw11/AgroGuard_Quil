# AgroGuard Unified

One team-ready workspace for **AgroGuard** (sensor monitoring, crop scoring,
disease detection, AI chat) and **AgriQill IDE** (farm contracts, water
planning, twin rehearsal, field app), consolidated from two separate
repositories (`AgriBackend/Agriculture` and `agroquill/Agriqill`) plus the
shared landing-page gateway that used to link them.

**This is the active workspace going forward.** The original two
repositories are kept untouched as recovery sources — see
[`docs/RECONCILIATION.md`](docs/RECONCILIATION.md) for exactly what moved,
what was intentionally left behind, and what remains unresolved.

## Architecture

```
┌─────────────┐     redirects to      ┌──────────────────────────┐
│ gateway:4000│ ─────────────────────▶│ apps/agroguard-web :5173  │
└─────────────┘                       │  (the one true entry point,│
                                       │   has the sign-in flow and │
                                       │   the "Open AgriQill IDE"  │
                                       │   sidebar link)            │
                                       └─────────────┬─────────────┘
                                                      │ /api proxy
                                                      ▼
                                       ┌──────────────────────────┐
                                       │ backend/agroguard :8000   │
                                       │  FastAPI — Postgres (Supabase)
                                       └──────────────────────────┘

                                       ┌──────────────────────────┐
                                       │ apps/agriquill-ide :3000  │
                                       └─────────────┬─────────────┘
                                                      │ /api proxy
                                                      ▼
                                       ┌──────────────────────────┐
                                       │ backend/agriquill :8010   │
                                       │  FastAPI — SQLite + JSONL ledger
                                       └──────────────────────────┘
```

Two backend processes, kept deliberately separate (no route/schema overlap,
divergent heavy ML dependency sets, independent crash domains, independent
ownership) — see RECONCILIATION.md for the full reasoning. AgroGuard's own
frontend proxy is hardcoded to port 8000, which is why AgriQill's API runs
on 8010 instead of its own 8000 default.

## Directory layout

```
AgroGuard-Unified/
├── apps/
│   ├── agroguard-web/     React/Vite — AgroGuard's frontend (sign-in, dashboard,
│   │                      sensors, NDVI, crop suggestion, disease detection, AI chat)
│   └── agriquill-ide/     React/Vite — AgriQill IDE (DSL editor, 3D spatial view,
│                          simulation replay, live twin, field app)
├── backend/
│   ├── agroguard/         FastAPI — app/ package, own pyproject.toml + venv
│   └── agriquill/         FastAPI — agriquill/ package, own pyproject.toml + venv
├── gateway/                Landing-page redirect + health-check endpoints
├── docs/
│   └── RECONCILIATION.md   What moved, what was excluded, what's unresolved
└── scripts/                 (start/stop helpers — see gateway/package.json)
```

## One-time setup

### 1. AgroGuard backend (`backend/agroguard`)

```powershell
cd backend\agroguard
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev]"
copy .env.example .env
# edit .env: set a real AGROGUARD_DATABASE_URL and any API keys you have
```

### 2. AgriQill backend (`backend/agriquill`)

```powershell
cd backend\agriquill
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev,mcp]"
copy .env.example .env
copy keys.env.example keys.env
# edit .env and keys.env with real values if you have them — both work with
# blank/missing keys, just with the corresponding provider features disabled
```

### 3. Frontends

```powershell
cd apps\agroguard-web
npm install
copy .env.example .env   # optional — defaults already point at localhost

cd ..\agriquill-ide
npm install
```

### 4. Gateway

```powershell
cd gateway
npm install
```

## Run

```powershell
npm run start
```

Starts all five processes (both frontends, both backends, the gateway) with
prefixed, interleaved logs in one terminal. **Ctrl+C stops everything.** If
a terminal gets closed instead of Ctrl+C'd and something is orphaned:

```powershell
npm run stop
```

Finds and stops whatever is listening on this workspace's five known ports
(3000, 4000, 5173, 8000, 8010), logging what it found.

Open **http://localhost:4000/** — it redirects straight to AgroGuard's own
landing page, which has the sign-in flow and, once inside the dashboard, an
"Open AgriQill IDE" link in the sidebar (opens in a new tab).

```powershell
npm run verify   # in a second terminal, while start is running
```

Checks the redirect, both apps' identity (title/fingerprint), both APIs, and
that neither frontend's `/api` proxy reaches the other backend.

### If a backend fails to start with a "No Python interpreter found" message

`npm run start` resolves each backend's interpreter itself — it never
silently falls back to a global `python` on PATH, because that's missing
the backend's dependencies and fails confusingly deep inside uvicorn
instead of here. It looks for, in order: an `AGROGUARD_PYTHON`/
`AGRIQUILL_PYTHON` environment variable (including one set in
`gateway/.env`, gitignored — see `gateway/.env.example`), then that
backend's own `backend/<name>/.venv`. If you followed "One-time setup"
above, the second one just works and you'll never see this message or
need `gateway/.env` at all. It only matters if you're intentionally
pointing a backend at an interpreter that lives outside this workspace —
e.g. one teammate's own local convenience venv — which is machine-specific
and must not be committed.

## Where to work on what

| You want to change... | Edit here |
|---|---|
| AgroGuard's UI, branding, sidebar, sign-in flow | `apps/agroguard-web/src/` |
| AgroGuard's scoring, alerts, Telegram, crop suggestion, disease detection, AI chat | `backend/agroguard/app/` |
| AgriQill IDE's 3D view, DSL editor, simulation, field app | `apps/agriquill-ide/src/` |
| AgriQill's telemetry, jobs, provider integrations (weather/soil/forest/prices), ledger | `backend/agriquill/agriquill/` |
| The landing page / entry routing | `gateway/` |

## Required external services

- **AgroGuard**: a Postgres database (Supabase works out of the box — see
  `backend/agroguard/.env.example`). Everything else (LLM, weather, Telegram)
  degrades gracefully to a fallback response if its key is blank.
- **AgriQill**: no required external service — SQLite + a local JSONL
  ledger, both already present under `backend/agriquill/data/`. The
  provider integrations in `keys.env.example` (Global Forest Watch,
  FAOSTAT, GLEAM) are optional; features using them fail soft without a key.

## Known gaps (see RECONCILIATION.md for the full list)

- The AgroGuard → AgriQill telemetry bridge is implemented and tested, but
  **disabled by default** — set `AGROGUARD_AGRIQUILL_BRIDGE_TOKEN` (see
  `backend/agroguard/.env.example`) to turn it on. See RECONCILIATION.md
  for the auth-credential decision behind the default.
- **Disease detection and AI chat are owned by other team members** and
  were intentionally left untouched in this consolidation — see
  RECONCILIATION.md → "Module handoff" for their current status
  (disease detection: code wired up but no trained weights exist yet,
  returns a generic error until one is supplied; AI chat: works today,
  runs in a templated fallback mode until `AGROGUARD_LLM_API_KEY` is set).
