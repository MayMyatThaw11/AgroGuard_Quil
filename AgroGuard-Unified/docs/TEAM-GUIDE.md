# Team guide: Farm Simulation is now part of AgroGuard

This guide is for everyone on the team pulling the `feature/farm-simulation` branch.
It covers what changed, how to set up your machine, and how to run every
feature. The [README](../README.md) has the full file-by-file table.

## In short

- **AgriQill IDE is no longer a separate app.** It now lives inside
  AgroGuard as the **Farm Simulation** item in the sidebar.
- The old `apps/agriquill-ide` folder and its port **3000** are gone. Its
  code moved to `apps/agroguard-web/src/features/farm-simulation/`.
- AgroGuard's landing page and email sign-in work exactly as before.
- Farm Simulation asks for a name and access code. The built-in one is:
  - Name: `Farm Manager`
  - Access code: `FARMSIM-2026`
- `npm run start` now starts **4** processes instead of 5.

## What changed

### What you see in the app

1. **Landing page and sign-in**: unchanged. Sign in with email and password
   to reach the dashboard.
2. **Sidebar**:
   - New **Farm Simulation** item (Burmese: လယ်ယာ စမ်းသပ်စနစ်).
   - New **Sign out** button at the bottom. It returns you to the landing
     page and also forgets the Farm Simulation name and code.
   - The old **Open AgriQill IDE** link is removed.
3. **Farm Simulation page** (`/farm-simulation`):
   - Takes the whole screen. The AgroGuard sidebar is hidden, and a thin bar
     on top has a **Back to dashboard** link.
   - Opens on AgriQill's original entry screen: a moving map of the demo
     farm on the left, and the name and access code boxes on the right.
   - **Try the demo farm** opens a read-only guided tour without a code.
     It now stays in view on shorter laptop screens.
   - After signing in it opens on the **3D Farm** view. All the other
     AgriQill tools are still in the left toolbar (farm map, agronomy,
     editor, workflows, agents, tests, knowledge, ledger, season replay,
     Ctrl+K command palette).
   - Everything the user reads says **Farm Simulation** instead of AgriQill.

### What changed in the code

| Area | What changed |
|---|---|
| `apps/agroguard-web/src/features/farm-simulation/` | New. AgriQill's frontend source, moved from `apps/agriquill-ide/src` |
| `apps/agroguard-web/farmsim/index.html` | New. Farm Simulation's own page, a second Vite entry |
| `apps/agroguard-web/src/pages/FarmSimulationPage.jsx` | New. The `/farm-simulation` route: Back to dashboard bar plus the Farm Simulation page in a frame |
| `apps/agroguard-web/src/App.jsx` | Adds the `/farm-simulation` route |
| `apps/agroguard-web/src/components/Sidebar.jsx` | Farm Simulation item and Sign out button added, Open AgriQill IDE link removed |
| `apps/agroguard-web/src/layouts/DashboardLayout.jsx` | Hides the sidebar on the Farm Simulation page |
| `apps/agroguard-web/src/contexts/LanguageContext.jsx` | English and Burmese labels for the new items |
| `apps/agroguard-web/src/api.js` | Removed `AGRIQUILL_IDE_URL` (`VITE_AGRIQUILL_IDE_URL`) |
| `apps/agroguard-web/vite.config.js`, `vite.farm-simulation.js` | Second page entry and the Farm Simulation proxy rules |
| `apps/agroguard-web/package.json` | Adds AgriQill's packages (three.js, MapLibre, React Three Fiber, zustand, ...) and TypeScript |
| `apps/agroguard-web/tests/farm-simulation/` | AgriQill's frontend tests |
| `backend/agriquill/agriquill/config.py`, `api/main.py` | Built-in name and access code |
| `apps/agriquill-ide/` | **Deleted** |
| `gateway/*`, `scripts/stop.mjs` | No longer start, stop or check port 3000 |
| `README.md`, `package.json`, `gateway/README.md` | Updated for the above |

Code names were kept on purpose: folder names, the `/api/v1/agriquill` API
path, the `X-AgriQuill-Write-Token` header and the `agriquill.*`
localStorage keys. Only what users read was renamed.

Nothing else in AgroGuard was changed: sensors, NDVI, crop suggestion,
disease detection, AI chat, IoT and health updates are untouched.

### If you worked on `apps/agriquill-ide`

That folder no longer exists. Make the same change in
`apps/agroguard-web/src/features/farm-simulation/` instead. The files keep
the same names and folder structure as the old `src/`.

## Setting up your machine

You need **Node.js**, **Python 3.11 or newer**, and **Docker Desktop**.
All commands are for PowerShell on Windows, run from the
`AgroGuard-Unified` folder unless a `cd` says otherwise.

### 1. Get the branch

```powershell
git fetch origin
git checkout feature/farm-simulation
git pull
```

If you had the old `apps\agriquill-ide` folder, Git removes it. If a copy
stays behind because of `node_modules`, delete that folder by hand.

### 2. AgroGuard API (port 8000)

```powershell
cd backend\agroguard
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev]"
copy .env.example .env
```

Open `backend\agroguard\.env` and set a real `AGROGUARD_DATABASE_URL`
(the team's Supabase/Postgres link). `AGROGUARD_LLM_API_KEY` is optional and
turns on the full AI chat.

### 3. Farm Simulation API (port 8010)

```powershell
cd backend\agriquill
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev,mcp]"
copy .env.example .env
copy keys.env.example keys.env
```

Both files work as they are. The keys in `keys.env` are optional.

### 4. Disease detection service (port 8001)

```powershell
cd plant_disease_detection
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

This installs PyTorch, so it is a large download. If you see
`No module named uvicorn` later, this step was skipped or failed.

### 5. Website and gateway

```powershell
cd apps\agroguard-web
npm install
cd ..\..\gateway
npm install
```

Run `npm install` in `apps\agroguard-web` again even if you had it before:
Farm Simulation added new packages.

## Running everything

Open **Docker Desktop** first, then use two terminals.

**Terminal 1: disease detection**

```powershell
cd plant_disease_detection
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8001 --reload
```

**Terminal 2: everything else**

```powershell
docker compose up -d mongo
npm run start
```

`npm run start` starts these four, with their logs in one terminal:

| Process | Port |
|---|---|
| AgroGuard website (includes Farm Simulation) | 5173 |
| AgroGuard API | 8000 |
| Farm Simulation API | 8010 |
| Gateway | 4000 |

Then open **http://localhost:4000/**:

1. Sign in with any email and password.
2. Click **Farm Simulation** in the sidebar.
3. Enter `Farm Manager` and `FARMSIM-2026`, or click **Try the demo farm**.

### What each feature needs

| Feature | Needs |
|---|---|
| Landing page, sign-in, dashboard | Website and gateway |
| Crop suggestion, sensors, NDVI, IoT, AI chat | AgroGuard API and its database |
| Health updates | MongoDB in Docker |
| Disease detection | Terminal 1 |
| Farm Simulation | Farm Simulation API |

### Check that everything is connected

In a third terminal, while the other two are running:

```powershell
npm run verify
```

Every line should say `PASS`. A `FAIL` line names the service that is not
answering.

### Stopping

Press **Ctrl+C** in each terminal. If a terminal was closed instead, run
`npm run stop`. MongoDB keeps running in Docker until you run
`docker compose stop mongo`.

## Tests

From `apps\agroguard-web`:

```powershell
npm run typecheck        # Farm Simulation TypeScript check
npm run test:farm-sim    # Farm Simulation tests
npm run build            # builds AgroGuard and the Farm Simulation page
```

From `backend\agriquill`:

```powershell
.venv\Scripts\python.exe -m pytest
```

## Common problems

- **"No Python interpreter found"**: the `.venv` from step 2 or 3 is missing.
- **"Already in use: 5173 ..."**: an earlier run is still going. Run
  `npm run stop`, then `npm run start`.
- **Farm Simulation page is blank or packages are missing**: run
  `npm install` again in `apps\agroguard-web`.
- **Farm Simulation says the planner is offline**: the Farm Simulation API
  on 8010 stopped. Check Terminal 2 for an error.
- **Health updates won't save**: Docker Desktop or MongoDB is not running.
- **Disease detection says unreachable**: Terminal 1 is not running.

## Changing the access code

The built-in name and code are in the repository, so anyone who can read it
can see them. Before putting the app anywhere public, change it in
`backend\agriquill\.env`:

```
AGRIQUILL_BUILTIN_USER=Your Name:YOUR-CODE:manager,crew:*
```

Set `AGRIQUILL_BUILTIN_USER=` (empty) to turn it off.
