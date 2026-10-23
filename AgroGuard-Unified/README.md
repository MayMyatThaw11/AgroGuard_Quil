# AgroGuard Unified

One team-ready workspace for **AgroGuard** (sensor monitoring, crop scoring,
disease detection, AI chat) and its **Farm Simulation** feature (3D farm
models, farm contracts, water planning, twin rehearsal, field app).
Farm Simulation is the former **AgriQill IDE**: it now lives inside AgroGuard
as a sidebar item, and the separate AgriQill IDE app (`apps/agriquill-ide`,
port 3000) has been removed. See
[Farm Simulation (formerly AgriQill)](#farm-simulation-formerly-agriqill)
below for everything that changed, and
[`docs/TEAM-GUIDE.md`](docs/TEAM-GUIDE.md) for a step-by-step team guide
(what changed, setup, and how to run every feature).

The workspace was consolidated from two separate repositories
(`AgriBackend/Agriculture` and `agroquill/Agriqill`) plus the shared
landing-page gateway that used to link them.

**This is the active workspace going forward.** The original two
repositories are kept untouched as recovery sources — see
[`docs/RECONCILIATION.md`](docs/RECONCILIATION.md) for exactly what moved,
what was intentionally left behind, and what remains unresolved.

## Architecture

```
┌─────────────┐     redirects to      ┌─────────────────────────────────────┐
│ gateway:4000│ ─────────────────────▶│ apps/agroguard-web :5173             │
└─────────────┘                       │  the one true entry point:           │
                                      │  landing page + email sign in,       │
                                      │  dashboard pages, and the            │
                                      │  Farm Simulation sidebar page        │
                                      │  (/farm-simulation → farmsim/)       │
                                      └──────┬──────────────┬───────────┬────┘
                         /api proxy           │   /api/v1/ml │           │ /api/v1/agriquill proxy
                ┌─────────────────────────────┘              │           │ (Farm Simulation only)
                ▼                                            ▼           ▼
 ┌──────────────────────────┐   ┌──────────────────────────────┐   ┌──────────────────────────┐
 │ backend/agroguard :8000   │   │ plant disease service :8001  │   │ backend/agriquill :8010   │
 │  FastAPI — Postgres       │   │  5-group classifier, runs    │   │  FastAPI — SQLite + JSONL │
 │  (crop suggestion, etc.)  │   │  from AgroGuard repo         │   │  ledger. Serves the Farm  │
 └──────────────────────────┘   └──────────────────────────────┘   │  Simulation name + access │
                                                                    │  code sign in             │
                                                                    └──────────────────────────┘
```

Two backend processes, kept deliberately separate (no route/schema overlap,
divergent heavy ML dependency sets, independent crash domains, independent
ownership) — see RECONCILIATION.md for the full reasoning. AgroGuard's own
`/api` proxy goes to port 8000, which is why AgriQill's API runs on 8010
instead of its own 8000 default. Farm Simulation reaches AgroGuard's API
through `/agroguard/*` (rewritten to `/*` on :8000, and `/agroguard/api/v1/ml/*`
to :8001), exactly as the old standalone IDE did.

## Directory layout

```
AgroGuard-Unified/
├── apps/
│   ├── agroguard-web/     React/Vite — AgroGuard's frontend (sign-in, dashboard,
│   │   │                  sensors, NDVI, crop suggestion, disease detection,
│   │   │                  AI chat, IoT, health updates, Farm Simulation)
│   │   ├── farmsim/index.html            Farm Simulation's page (2nd Vite entry)
│   │   ├── src/pages/FarmSimulationPage.jsx   the /farm-simulation route
│   │   ├── src/features/farm-simulation/ Farm Simulation source (TypeScript,
│   │   │                                 moved from the old apps/agriquill-ide/src)
│   │   ├── tests/farm-simulation/        Farm Simulation tests (node --test)
│   │   ├── vite.farm-simulation.js       Farm Simulation proxy rules + mock API
│   │   └── tsconfig.farm-simulation.json type check settings for the feature
├── backend/
│   ├── agroguard/         FastAPI — app/ package, own pyproject.toml + venv
│   └── agriquill/         FastAPI — agriquill/ package, own pyproject.toml + venv
│                          (also the Farm Simulation backend)
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
# AI chat: set AGROGUARD_LLM_API_KEY to a free Groq key (console.groq.com/keys)
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

### 3. Frontend

```powershell
cd apps\agroguard-web
npm install              # also installs Farm Simulation's packages (three.js, MapLibre, ...)
copy .env.example .env   # optional — defaults already point at localhost
```

### 4. Gateway

```powershell
cd gateway
npm install
```

## Run

Start MongoDB once (it keeps running in Docker, and its data persists in the
`agroguard-mongo-data` volume), then start the workspace:

```powershell
docker compose up -d mongo
npm run start
```

Starts all four processes (AgroGuard's frontend, both backends, the gateway) with
prefixed, interleaved logs in one terminal. **Ctrl+C stops everything.** If
a terminal gets closed instead of Ctrl+C'd and something is orphaned:

```powershell
npm run stop
```

Finds and stops whatever is listening on this workspace's four known ports
(4000, 5173, 8000, 8010), logging what it found.

Open **http://localhost:4000/** — it redirects straight to AgroGuard's own
landing page, which has the email/password sign-in flow. Once inside the
dashboard, the sidebar has a **Farm Simulation** item (asks for a name and
access code; see below).

```powershell
npm run verify   # in a second terminal, while start is running
```

Checks the redirect, AgroGuard's identity, the Farm Simulation sidebar item
and page, both APIs, and that each proxy prefix reaches the right backend.
The disease service and MongoDB checks fail if those aren't running.

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
| Farm Simulation's 3D farm view, entry screen, DSL editor, simulation, field app | `apps/agroguard-web/src/features/farm-simulation/` |
| How Farm Simulation sits in AgroGuard (route, frame, sidebar item) | `apps/agroguard-web/src/pages/FarmSimulationPage.jsx`, `src/components/Sidebar.jsx`, `src/layouts/DashboardLayout.jsx` |
| Farm Simulation's dev proxy and no-backend mock API | `apps/agroguard-web/vite.farm-simulation.js` |
| Farm Simulation's built-in name and access code, other sign-ins | `backend/agriquill/agriquill/config.py` (`builtin_user`) or `.env` (`AGRIQUILL_BUILTIN_USER`, `AGRIQUILL_USERS`) |
| AgriQill's telemetry, jobs, provider integrations (weather/soil/forest/prices), ledger | `backend/agriquill/agriquill/` |
| The landing page / entry routing | `gateway/` |
| Farm Simulation's opening-screen video | `apps/agroguard-web/src/features/farm-simulation/components/SignIn.tsx` (`FARM_SIM_VIDEO`), see below |

## Farm Simulation video

Farm Simulation's opening screen (the sign-in screen at `/farm-simulation`)
has a space for a demo video on the left, where the demo farm map is. Until a
video is set, the demo farm map shows as before.

To add the video:

1. Put the file in `apps/agroguard-web/public/videos/`, for example
   `farm-simulation.mp4`. MP4 (H.264) plays in every browser; WebM also works.
2. Open `apps/agroguard-web/src/features/farm-simulation/components/SignIn.tsx`.
   Near the top is:

   ```ts
   const FARM_SIM_VIDEO = {
     src: '',
     poster: '',
   };
   ```

   Set `src` to `'/videos/farm-simulation.mp4'`. `poster` is optional: a still
   image (also in `public/videos/`) shown before the video plays.
3. Reload the page. The video takes the place of the demo farm map, with
   normal play controls.

To use a hosted video instead, set `src` to its full `https://` URL to the
video file. A YouTube page link will not play in a `<video>` tag.

## Safety and sign-in

- **The Farm Simulation API fails closed.** `backend/agriquill` defaults to
  `AGRIQUILL_ENVIRONMENT=production`: it refuses to start unless
  `AGRIQUILL_USERS` or `AGRIQUILL_WRITE_TOKEN` is set, and the built-in
  `Farm Manager` demo sign-in is switched off. `npm run start` sets
  `development` for you (override it in your shell or `gateway/.env`), which
  turns the demo sign-in back on. Blank values for these settings count as
  "not set".
- **Only declared sensors report.** Telemetry (LoRaWAN webhooks and manual
  readings) is accepted only for sensors a farm contract declares. Webhooks
  take one token per network (`AGRIQUILL_TELEMETRY_TTN_TOKEN`,
  `AGRIQUILL_TELEMETRY_CHIRPSTACK_TOKEN`). The AgroGuard bridge user may also
  report its own `agroguard:` sensors.
- **Approvals are rate limited.** Wrong PINs (5 per caller per 10 minutes) and
  approval requests (5 per minute per caller or farm) return HTTP 429. The
  counters live in memory in one server process.
- **Agents cannot finish an actuation.** The MCP `lorawan_actuate` tool only
  runs the safety gates and waits for a named person; it takes no PIN,
  confirmation or token. `drone_spray_guard` takes the higher of the agent's
  wind and the server's own (on-site anemometer, else today's forecast
  maximum) when given a `farm_id`.
- **Field commands are never approved by the modal.** In Farm Simulation a
  command is proposed first and approved in a separate step with a typed PIN
  and an unticked confirmation. That dispatch is simulated; real machine
  commands go through the server flow in `OpsTaskCard`.

Checks (from `backend/agriquill`): `python -m pytest`, `python -m ruff check
agriquill tests`, `python -m mypy`. From `apps/agroguard-web`: `npm run
typecheck` and `npm run test:farm-sim`.

## Photo checks and agronomist review

- **Photos are checked before diagnosis.** `POST /api/v1/photos/quality` flags a
  photo that is blurry, dark, washed out, tiny or blank so it can be retaken. The
  Disease Detection and Health Updates pages call it first; "Use this photo anyway"
  carries on, with a weaker verdict.
- **Answers say how sure the model is.** The disease service always names a class,
  so `src/lib/diseaseVerdict.js` turns its score into "Looks like X, fairly sure",
  "Possibly X, not very sure" or "Not sure, ask your agronomist" (no diagnosis or
  treatment shown). The two cut-offs (85 and 60) and the quality thresholds in
  `app/ml/photo_quality.py` are starting values, **not validated on Myanmar farmer
  photos**; re-set them from reviewed photos.
- **Consent and review.** A Health Updates photo can be shared with agronomists
  (unticked by default, withdrawable by editing the report). `/photo-review` lists
  consented photos the model knows least about first. Reviewing needs
  `AGROGUARD_REVIEW_TOKEN` on the API (unset means the review routes are off).
  `GET /api/v1/photos/labelled` exports reviewed, consented photos as training
  examples. Nothing here trains a model: that needs enough reviewed photos first.
- **The crop suggestion score is a ranking**, not a probability. The ASEAN Top-50
  model was trained on samples generated from crop range tables, so it has never
  been tested on real yields, and the screens and API (`modelInfo`) say so.
  AgriQill's API no longer reports a synthetic 1.0 accuracy or a "95-98%" target.
- This API has no sign-in of its own (only the review routes use a token), and saved
  photos are served by URL without one. Put it behind a proxy or add sign-in before
  collecting photos from real farmers.

## Required external services

- **AgroGuard**: a Postgres database (Supabase works out of the box — see
  `backend/agroguard/.env.example`). Everything else (LLM, weather, Telegram)
  degrades gracefully to a fallback response if its key is blank.
- **Plant disease detection**: the 5-group classifier service from the
  AgroGuard repo (`AgroGuard/plant_disease_detection`), started on its own:
  `uvicorn app.main:app --port 8001 --reload` from that folder. This
  workspace doesn't start it — `npm run start` only warns if it's down, and
  `npm run verify` checks it. AgroGuard's frontend proxies `/api/v1/ml/*` to it
  (`AGROGUARD_DISEASE_API_TARGET` overrides `http://localhost:8001`).
- **NASA POWER and ISRIC SoilGrids** (Crop Suggestion map and "Detect my
  location"; both free, no key): temperature, annual rainfall and humidity
  come from NASA POWER's long-term climatology, soil pH from SoilGrids (about
  250 m, top 30 cm). SoilGrids has gaps (cities, water) and a low rate limit,
  so missing points are retried nearby, results are cached, and inside
  Myanmar the old regional pH table is the last resort (labelled as such).
  If NASA POWER is unreachable the lookup fails with a clear message rather
  than filling in made-up values. Needs internet access.
- **PostgreSQL** (users, plans, sensors, water, alerts): `docker compose up -d postgres` from the
  workspace root runs it on `127.0.0.1:5432` (user `postgres`, password `postgres`, database
  `agroguard`, for local testing only), which is the default `AGROGUARD_DATABASE_URL`. Then run
  `alembic upgrade head` from `backend/agroguard`. Use `127.0.0.1` rather than `localhost` in the URL if a
  connection hangs. The tests that need a database run against it.
- **MongoDB** (health updates only): `docker compose up -d mongo` from the
  workspace root runs it on `127.0.0.1:27017` (`AGROGUARD_MONGO_URL` /
  `AGROGUARD_MONGO_DATABASE` override). Each health update stores its photo
  and a K-means disease map in GridFS (`health_images` bucket) plus the
  report in the `health_updates` collection. Everything else in AgroGuard
  stays on PostgreSQL. `npm run start` warns if MongoDB is down.
- **AgriQill**: no required external service — SQLite + a local JSONL
  ledger, both already present under `backend/agriquill/data/`. The
  provider integrations in `keys.env.example` (Global Forest Watch,
  FAOSTAT, GLEAM) are optional; features using them fail soft without a key.

## Farm Simulation (formerly AgriQill)

### What a user sees

1. The AgroGuard landing page and its **Sign in / Sign up** popup (email and
   password) are unchanged. Signing in opens the dashboard.
2. The sidebar has a new **Farm Simulation** item (Burmese: လယ်ယာ စမ်းသပ်စနစ်),
   at `/farm-simulation`. It opens in the same tab and takes the whole
   screen: the AgroGuard sidebar is hidden there, and a thin bar on top has a
   **Back to dashboard** link. Below the menu, the sidebar also has a
   **Sign out** button. It returns to the landing page and also forgets the
   Farm Simulation name and code.
3. Farm Simulation first shows AgriQill's original entry screen: a live,
   slowly moving map of the demo cooperative on the left (with farm, weather
   and record-chain facts), and on the right the introduction ("Farm work,
   checked before it happens"), the **Your name** and **Access code** boxes,
   and the "Try the demo farm" guided tour link (read-only, no code needed).
   On shorter screens the column tightens its spacing, and hides the three
   proof points below 760 px of height, so that link stays in view.
4. After signing in it opens on the **3D Farm** view (terrain, paddies, bunds,
   canals, robots, sensors, animals, structures, camera controls, ML brain).
   Every other AgriQill tool is still in the left toolbar: Farm map (globe →
   field, fleet monitor, paddy thresholds, practice plans/twin, 3D farm
   operations), Agronomy, Explorer/.agri editor, Workflows, Agents, Tests,
   Knowledge, ledger, season replay and the command palette (Ctrl/⌘+K).
5. Everything a user reads says **Farm Simulation** instead of AgriQill /
   AgriQuill IDE. The old **Open AgriQill IDE** link at the bottom of the
   sidebar is gone, along with the separate app it opened on :3000.

### Built-in name and access code

| Your name | Access code | Rights |
|---|---|---|
| `Farm Manager` | `FARMSIM-2026` | manager + field crew, all farms |

- Set in `backend/agriquill/agriquill/config.py` as `builtin_user`
  (format `name:code:roles[:farm1,farm2]`, `*` = all farms).
- It is always accepted **in addition to** any people listed in
  `AGRIQUILL_USERS`, so the entry screen always shows.
- Change it without editing code by setting `AGRIQUILL_BUILTIN_USER` in
  `backend/agriquill/.env`, or set `AGRIQUILL_BUILTIN_USER=` (empty) to turn
  it off. With it off and no `AGRIQUILL_USERS`/`AGRIQUILL_WRITE_TOKEN`, the
  backend is open and the entry screen is skipped, as before.
- The sign-in is remembered in that browser (like the original app) until
  the user presses **Sign out** in Farm Simulation's top bar.
- Anyone who reads this repository can see the built-in code. Change it
  through `.env` before putting the app anywhere public.

### How it is built

- **One app.** The AgriQill frontend source was moved from
  `apps/agriquill-ide/src` to `apps/agroguard-web/src/features/farm-simulation`
  and is built by AgroGuard's own Vite. `apps/agroguard-web/package.json`
  gained AgriQill's packages (three.js, React Three Fiber/drei, MapLibre,
  zustand, TanStack Query, FullCalendar, luxon, …) and TypeScript.
- **Two pages, one build.** `farmsim/index.html` is a second Vite entry
  (`build.rollupOptions.input` in `vite.config.js`). The `/farm-simulation`
  route (`src/pages/FarmSimulationPage.jsx`) shows that page in a frame
  under its "Back to dashboard" bar. The frame keeps Farm Simulation's dark 3D workspace CSS,
  its Tailwind reset and its keyboard shortcuts from changing AgroGuard's
  pages, and keeps its URL options working: `/farm-simulation?farm=<id>`,
  `?story` (guided demo) and `?field` (field app) are passed through.
- **Lazy loading.** AgroGuard's own pages do not load three.js or MapLibre;
  only the Farm Simulation page does (its main chunk is about 1.8 MB, so the
  build's chunk warning limit is 2000 kB).
- **Proxy.** `vite.farm-simulation.js` adds `/api/v1/agriquill` → :8010
  (`AGRIQUILL_API_TARGET`), `/agroguard/api/v1/ml` → :8001 and `/agroguard`
  → :8000, ahead of AgroGuard's own `/api` rule.
- **No-backend mode.** `AGRIQUILL_USE_MOCK_API=1 npm run dev` in
  `apps/agroguard-web` serves the same labelled demo responses the old
  standalone IDE's mock did.
- **Code names stay.** Folder names, API paths (`/api/v1/agriquill`), the
  `X-AgriQuill-Write-Token` header, `localStorage` keys (`agriquill.*`) and
  component names like `AgriQillTopBar` were not renamed, so saved sign-ins,
  settings and data keep working.

### All changes in this merge

| File | Change |
|---|---|
| `apps/agroguard-web/src/features/farm-simulation/**` | New: AgriQill source, with user-facing names changed to Farm Simulation |
| `apps/agroguard-web/src/features/farm-simulation/App.tsx` | Opens on the 3D Farm view; fixed a crash when pressing **Back to farm operations** in Paddy settings (the click event was being used as a farm id) |
| `…/farm-simulation/components/ActivityBar.tsx` | "Spatial" renamed **3D Farm** and moved to the top |
| `…/farm-simulation/components/ops/OpsInspector.tsx`, `OpsCrewTimeline.tsx` | "Planner offline" hint now says `npm run start` / backend on :8010 instead of the standalone `npm run dev:full` |
| `apps/agroguard-web/farmsim/index.html` | New: Farm Simulation page (title "Farm Simulation · AgroGuard") |
| `apps/agroguard-web/src/pages/FarmSimulationPage.jsx` | New: `/farm-simulation` route, with a thin **Back to dashboard** bar on top |
| `apps/agroguard-web/src/App.jsx` | Adds the `/farm-simulation` route inside the dashboard layout |
| `apps/agroguard-web/src/components/Sidebar.jsx` | Adds the **Farm Simulation** item and a **Sign out** button; removes the "Open AgriQill IDE" link |
| `…/farm-simulation/signin.css` | Entry screen scrolls on its own and tightens on short screens, so **Try the demo farm** isn't cut off |
| `apps/agroguard-web/src/api.js` | Removes `AGRIQUILL_IDE_URL` (`VITE_AGRIQUILL_IDE_URL`), which only that link used |
| `apps/agroguard-web/src/layouts/DashboardLayout.jsx` | Hides the AgroGuard sidebar on the Farm Simulation route so it takes the whole screen |
| `apps/agroguard-web/src/contexts/LanguageContext.jsx` | English and Burmese labels for Farm Simulation, Back to dashboard and Sign out |
| `apps/agroguard-web/vite.config.js`, `vite.farm-simulation.js` | Second page entry, Farm Simulation proxy rules, mock API, ES workers |
| `apps/agroguard-web/package.json`, `package-lock.json`, `tsconfig.farm-simulation.json` | Farm Simulation packages, TypeScript, new scripts |
| `apps/agroguard-web/public/assets/fonts`, `public/templates` | Fonts and CSV templates Farm Simulation uses |
| `apps/agroguard-web/tests/farm-simulation/**` | AgriQill's frontend tests, import paths updated |
| `backend/agriquill/agriquill/config.py`, `agriquill/api/main.py` | Built-in name and access code (`builtin_user`) |
| `backend/agriquill/tests/conftest.py`, `tests/test_agriquill_builtin_user.py` | Tests run with the built-in user off; new tests for it |
| `apps/agriquill-ide/**` | **Removed**: the separate AgriQill IDE app on :3000. Its source lives on in `src/features/farm-simulation` |
| `gateway/start-all.mjs`, `scripts/stop.mjs` | No longer start or stop the :3000 app; AgroGuard's frontend gets `AGRIQUILL_API_TARGET` instead |
| `gateway/gateway.config.json`, `config.mjs`, `server.mjs` | The `agriquill` entry is now the backend-only **Farm Simulation API** (no frontend or :3000 URL) |
| `gateway/verify.mjs` | Checks the Farm Simulation sidebar item, the `/farmsim/` page and the `/api/v1/agriquill` proxy instead of the :3000 app |
| `package.json`, `gateway/package.json`, `gateway/README.md` | Descriptions no longer mention a separate AgriQill IDE |

### Checking it works

From `apps/agroguard-web`:

```powershell
npm run typecheck         # Farm Simulation TypeScript check (0 errors)
npm run test:farm-sim     # 372 Farm Simulation tests (all pass)
npm run build             # builds AgroGuard + the Farm Simulation page
npm run test:farm-sim:integration   # live API tests (need backend/agriquill on :8010)
```

From `backend/agriquill`: `.venv\Scripts\python.exe -m pytest`
(includes `test_agriquill_builtin_user.py`).

When this merge was made, all of the above passed, except three backend
tests that need real provider keys or PyTorch installed (forest screening,
GLEAM connection cap, neural forecast residual). They fail the same way
without this change. A browser run then went through: landing page →
email sign in → dashboard → Farm Simulation → wrong code (error shown) →
built-in code → every toolbar view → fleet → paddy settings → 3D farm
operations → practice plans → guided demo → field app → every other
AgroGuard page. It found no JavaScript errors. The only console errors came
from services that were not running in that environment (the AgroGuard
backend on :8000, and internet map tiles and weather).

After removing the :3000 app, `npm run start`, `npm run stop` and
`npm run verify` were run again: everything started, and every verify check
passed except the disease service and MongoDB ones, which were not running
in that environment.

`docs/RECONCILIATION.md` is a record of the original consolidation, so it
still describes `apps/agriquill-ide` as it was then.

## Known gaps (see RECONCILIATION.md for the full list)

- The AgroGuard → AgriQill telemetry bridge is implemented and tested, but
  **disabled by default** — set `AGROGUARD_AGRIQUILL_BRIDGE_TOKEN` (see
  `backend/agroguard/.env.example`) to turn it on. See RECONCILIATION.md
  for the auth-credential decision behind the default.
- **Disease detection** is served by the separate :8001 service above
  (`POST /api/v1/ml/predict`, with `group_id` and optional `crop_name`).
  The older single-model `POST /api/v1/disease-detect` route on :8000 is
  still there but no frontend calls it any more.
- **Health updates** use a farmer's photo: the 8001 service pre-fills plant
  type and disease (editable), soil pH / rainfall / temperature come from
  the last Crop Suggestion run in the same browser, and the backend's
  K-means segmentation (`app/ml/leaf_segmentation.py`) measures the
  discoloured share of the leaf. That figure is a colour heuristic, not a
  diagnosis — shadows on coloured backdrops or naturally non-green leaves
  can skew it.
- **AI chat** uses Groq's free tier (`openai/gpt-oss-120b`) and runs in a
  templated fallback mode until `AGROGUARD_LLM_API_KEY` is set in
  `backend/agroguard/.env`. It only answers farming questions, in English or
  Burmese; see `backend/agroguard/README.md` → "AI chat" for how the
  guardrails work.
- **Crop suggestion** uses the ASEAN Top-50 GaussianNB model
  (`app/ml/artifacts/asean_crop_gnb.joblib`, retrain with
  `python -m app.ml.training.train_model`) with ASEAN price data. If that
  model is missing it falls back to the original plants.csv + township
  ranking instead of failing.
