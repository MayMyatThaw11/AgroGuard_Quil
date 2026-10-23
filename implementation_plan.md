# Plan: Farm Simulation subscription (demo)

Goal: every user can try **3 different farms** in the Farm Simulation for free. After that, a **mock card checkout** unlocks **Pro** (unlimited farms). Demo only, so no real payment provider.

## Decisions made

| Decision | Choice | Why |
|---|---|---|
| Login | **JWT from AgroGuard** is the user's identity | Needed to know who is counting. |
| What counts toward the limit | **A new farm (parcel) the user starts a simulation on.** Re-running or replaying a farm already tried is free. | Fits "the system can simulate many farms". Pause and resume must not cost anything. Easy to say: "Try 3 farms free." |
| Limit | **3 farms** on Free, unlimited on Pro | Set by `free_farm_limit` in the config. |
| Sample farms (ASEAN presets) | **Counted like any other farm** | Simple, and a judge can try three samples. Can be changed to free later. |
| Story preview (`?story`) and read-only pages | Free and uncounted | The preview must work for everyone. |

## What I found in the code
| Finding | Consequence |
|---|---|
| AgroGuard sign-in is front-end only. `LandingPage.jsx` `submit()` just calls `onSuccess()` and navigates to `/dashboard`. | There is no user identity, so we must add a minimal one first. |
| AgriQuill authenticates with `X-AgriQuill-Write-Token` and access codes (`_reader` / `_caller` in `backend/agriquill/agriquill/api/main.py`). | The plan check is a new, separate dependency. The existing token flow stays. |
| The "run" action is `POST /api/v1/agriquill/sim/run` (`sim_run`, `main.py` line ~314). It takes a `parcel_id`, calculates the result **inside the same request** and answers `COMPLETED` at once. | This is the single place to count. There is no background task, so a failed run only needs its farm slot released. |
| In the page (`features/farm-simulation/App.tsx`, `handleToggleSimulate`), **every start of the replay calls `runSim`, including resuming after a pause**, and the page does not wait for the answer (fire and forget). | Counting farms makes the resume harmless. The Play button must now ask first and only then start, so a 402 can show the lock. |
| Farm Simulation runs in a same-origin iframe (`FarmSimulationPage.jsx` loads `/farmsim/`). | The iframe can read the parent's `localStorage` token. No cross-origin work is needed. |
| `DashboardLayout` hides the sidebar on `/farm-simulation`; only a thin top bar is shown. | The plan chip for the simulation page goes in that top bar. |
| AgroGuard backend is Postgres with Alembic (latest `0006_seed_demo_sensor_device.py`). | Add migration `0007`. |

## Architecture
AgroGuard owns users, plan and the list of farms each user has tried. AgriQuill asks it before each run.

```mermaid
sequenceDiagram
  participant FE as agroguard-web (+ farmsim iframe)
  participant AG as AgroGuard API :8000
  participant AQ as AgriQuill API :8010
  FE->>AG: POST /auth/demo-login (email)
  AG-->>FE: JWT
  FE->>AQ: POST /sim/run {parcel_id} (Authorization: Bearer JWT)
  AQ->>AG: POST /internal/entitlements/consume-farm (service key, user_id, parcel_id)
  AG-->>AQ: allowed, farms_used, already_counted  (or 402)
  AQ-->>FE: 202 run  (or 402 farm_limit_reached)
  FE->>AG: POST /billing/mock-checkout (card form)
  AG-->>FE: plan = pro
```

## Phase 0: Local PostgreSQL in Docker (done first, for seeding and tests)
Test users, plans and the migrations need a real PostgreSQL. `docker-compose.yml` now has a `postgres` service (PostGIS 16, container `agroguard-postgres`, database `agroguard`, user `postgres`, password `postgres`, port 5432 on this machine only).
1. Start it: `docker compose up -d postgres` from `AgroGuard-Unified`.
2. Create the tables: `alembic upgrade head` from `backend/agroguard` (migrations 0001 to 0006, then 0007 from Phase 1).
3. The connection is `AGROGUARD_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/agroguard`. This is also the code's default, so nothing needs configuring unless `backend/agroguard/.env` sets another database (an older setup there points to a user called `agroguard_app`). Change that line, or remove it, to use the Docker database.
4. The test users (`free@demo.com`, `pro@demo.com`) are seeded by a script that runs against this database (Phase 1, step 6). The same database lets the existing AgroGuard tests that need PostgreSQL run.
5. `docker compose down` stops it and keeps the data. `docker compose down -v` also deletes the data, which resets everything.

## Phase 1: Minimal identity (AgroGuard backend)
1. Migration `0007_add_users_subscriptions.py` creates:
   - `users(id, email unique, created_at)`
   - `subscriptions(user_id PK/FK, plan 'free'|'pro', status, current_period_end, updated_at)`
   - `simulated_farms(user_id FK, parcel_id, first_run_at, last_run_at, run_count, PRIMARY KEY (user_id, parcel_id))`: one row per farm the user has tried.
   - `payments(id, user_id, amount, currency, card_last4, status, created_at)` for a receipt history.
2. Models in `app/db/models/` (`user.py`, `subscription.py`, `simulated_farm.py`, `payment.py`) and register them in `__init__.py`.
3. `app/core/config.py` gets `jwt_secret`, `internal_service_key`, `free_farm_limit=3`.
4. `app/core/security.py` signs and verifies an HS256 JWT (`sub` = user id, `email`, `exp`) and provides a `current_user` dependency.
5. Endpoints in `app/api/v1/endpoints/auth.py`:
   - `POST /auth/demo-login`: upsert the user by email (`INSERT ... ON CONFLICT`) and create a free subscription row. It checks no password, which is fine for a demo. Password hashing can be added later.
   - `GET /me`.
6. The seed script adds `free@demo.com` and `pro@demo.com`.

## Phase 2: Entitlements and mock billing (AgroGuard backend)
Endpoints in `app/api/v1/endpoints/billing.py`:
- `GET /me/entitlements` returns `{plan, farms_used, farms_limit, farms_left, status}`. `farms_left` is `null` for Pro.
- `POST /billing/mock-checkout` takes `{card_number, exp, cvc, name}`:
  - Validate shape only (Luhn check, future expiry, 3-digit CVC).
  - **Never store the full card number or CVC.** Keep only `last4`.
  - Test cards: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` returns "card declined" so you can show the failure state.
  - Add a 1.5s delay to simulate processing.
  - On success set `plan='pro'`, `current_period_end=now+30d`, and insert a `payments` row.
- `POST /billing/cancel` sets `plan='free'`. Saved data stays read-only. Farms already tried stay on record.
- `POST /internal/entitlements/consume-farm` is guarded by the `X-Service-Key` header and takes `{user_id, parcel_id}`:
  - In **one transaction**: if the (user, parcel) row exists, bump `run_count` and `last_run_at` and answer `already_counted: true`. If not, insert it only when the user is Pro, or has fewer than `free_farm_limit` rows. Do the count and the insert in one statement (for example `INSERT ... SELECT ... WHERE (plan = 'pro' OR (SELECT count(*) ...) < limit) ON CONFLICT DO NOTHING`), so two simultaneous requests cannot get a fourth farm.
  - If nothing was inserted and the row did not exist, return `402 {code:"farm_limit_reached", farms_used, farms_limit}`.
  - `POST /internal/entitlements/release-farm` removes a row that was created by a run that then failed.
- `POST /admin/demo/reset` (development only) clears the farm list and resets the plan so you can replay the demo.

## Phase 3: Enforce in AgriQuill
1. `backend/agriquill/agriquill/entitlements.py`:
   - `verify_jwt()` uses the same secret (`AGRIQUILL_JWT_SECRET`).
   - `consume_farm(user_id, parcel_id)` calls AgroGuard internal (`httpx`, 2s timeout, service key). `release_farm(...)` is called if the simulation then raises an error.
2. Add a `require_farm_quota` dependency on `sim_run` only, reading `parcel_id` from the request body. Keep `WRITE`.
   - No token returns `401`.
   - AgroGuard returns `402`, which AgriQuill passes through with a JSON body `{code, farms_used, farms_limit}`.
   - If AgroGuard is unreachable, fail **closed** (503) in production. Allow it with a warning when `AGRIQUILL_ENVIRONMENT=development` so local work isn't blocked.
3. Add `AGRIQUILL_AGROGUARD_URL`, `AGRIQUILL_JWT_SECRET` and `AGRIQUILL_SERVICE_KEY` to `.env.example`. Add the matching AgroGuard vars to its `.env.example`.
4. Leave read endpoints and the story preview unrestricted.

## Phase 4: Frontend, AgroGuard side (`apps/agroguard-web`)
1. Fix the auth flow:
   - `LandingPage.jsx` `submit()` calls `/auth/demo-login`, stores the JWT in `localStorage` (`agroguard_token`), then navigates.
   - `src/lib/session.js` has `getToken`, `logout` and a `useEntitlements()` hook (fetch, cache, `refresh()`). Sidebar **Sign out** clears this token as well as the Farm Simulation keys.
   - Which routes need a token is still open (see below). Until decided, only the Farm Simulation runs need one.
2. `Sidebar.jsx`: show a plan chip next to Farm Simulation ("Free · 2 of 3 farms left" or "Pro").
3. New `src/pages/PricingPage.jsx` at `/pricing`: Free and Pro cards, with the "Subscribe" button opening the checkout modal.
4. New `src/components/CheckoutModal.jsx`:
   - Card form with formatted number, `MM/YY` and CVC.
   - States: idle, processing spinner, success ("You're Pro", then `refresh()`), declined.
   - A visible "Test payment: no real charge. Use 4242 4242 4242 4242" hint.
5. `FarmSimulationPage.jsx`:
   - The chip and an Upgrade link go in the **thin top bar** above the iframe, because the sidebar is hidden on this page: "Free: 2 of 3 farms left".
   - Listen for `postMessage({type:'aq:limit-reached'})` from the iframe (check `event.origin` and `event.source`) and open the checkout modal.
   - Listen for `aq:run-complete` and refresh the entitlements.
6. Upsell hooks (optional, Phase 6): on `DiseaseDetectionPage` and `CropSuggestion`, add a "Simulate this on your farm" button linking to `/farm-simulation`.
7. i18n: add the new strings, in English and Burmese, to `LanguageContext.jsx`. New pages use the `--ag-*` colours so they work in dark mode.

## Phase 5: Frontend, Farm Simulation side (`src/features/farm-simulation`)
1. In the API client (`lib/api.ts`), attach `Authorization: Bearer <agroguard_token>` from `localStorage` on all AgriQuill calls. This works because the iframe is same-origin.
2. **Play asks first.** In `App.tsx` `handleToggleSimulate`, when the replay starts, wait for `runSim` before starting it (today it is fire and forget).
   - On success, start the replay.
   - On `402`: do not start, show a locked overlay "You've tried 3 farms. Upgrade to simulate more.", and `window.parent.postMessage({type:'aq:limit-reached'}, location.origin)`. Reuse the existing error format in `lib/apiError.ts` so the message is translated.
   - Resuming after a pause calls `runSim` again, which is harmless: the farm is already counted.
3. On a successful run, post `aq:run-complete` to the parent.
4. Show a small "N of 3 farms left" chip in the run toolbar. A farm already tried shows "already counted".
5. Keep the story and sample-farm preview (`?story`) free and uncounted.

## Phase 6: Polish for the demo
- Add a "Reset demo" button in a hidden admin area (or `?demo=1`).
- Add the downgrade state: Pro to Free keeps saved farms viewable, keeps the farms already tried, and blocks new farms beyond the limit.
- Add the upsell buttons from Phase 4, step 6.
- Add a short in-app tooltip: "Farms are counted per account. Re-running a farm is free."

## Testing
| Layer | Tests |
|---|---|
| AgroGuard (pytest, needs PostgreSQL) | Demo-login creates the user and free row. `consume-farm` allows 3 different farms and returns 402 for the 4th. **The same farm twice counts once.** Pro is unlimited. Concurrent requests for different farms cannot exceed 3 (race test). `release-farm` frees the slot. Luhn, expiry and decline-card paths. Service key required. Card number and CVC are never persisted. Migration up and down. |
| AgriQuill (pytest) | `sim/run` without a JWT gives 401. The 4th farm gives 402. Invalid or expired JWT gives 401. Read endpoints stay open. A failing simulation releases the slot. Unreachable AgroGuard fails closed outside development. |
| Frontend (`node --test`, existing pattern in `tests/farm-simulation`) | Entitlements hook, checkout validation, 402 handling, Play does not start the replay on 402, pause and resume does not show the lock. |
| Manual / E2E | Run the demo script below. Also run `npm run verify` and `verify:farm-map`. |

## Demo script (3 min)
1. Sign in as `free@demo.com`. The chip shows "Free · 3 of 3 farms left".
2. Open Farm Simulation, pick a sample farm and press Play. The chip shows 2 left. Pause and press Play again: still 2.
3. Pick a second and a third farm. The chip shows 0 left.
4. Pick a fourth farm and press Play: the lock overlay appears. Click Upgrade.
5. Enter `4000 0000 0000 0002` to show the decline. Then enter `4242 4242 4242 4242` and see success.
6. The overlay disappears and the chip shows Pro. Press Play on the fourth farm.

## Order of work and rough effort
| # | Phase | Effort |
|---|---|---|
| 1 | Identity and migration | 2–3 h |
| 2 | Entitlements and mock billing | 2–3 h |
| 3 | AgriQuill enforcement | 1–2 h |
| 4 | AgroGuard UI | 3–4 h |
| 5 | Farm Sim UI | 2–3 h |
| 6 | Polish and tests | 2–3 h |

Total is about 1.5–2 days. Phases 1–3 are the backend and can be tested without the UI.

## Risks and decisions
- **Demo login has no password.** Anyone can sign in as any email. That's acceptable for a demo, but label it clearly and don't deploy it publicly.
- **The JWT in `localStorage`** is fine for a demo. Use httpOnly cookies if this goes to production.
- **Counter location:** AgroGuard (Postgres) is the single source of truth.
- **What counts:** only `sim/run`, and only the first run of each farm. Tell me if other calls (`/ops/plan`, tasks) should count too.
- **Existing token flow:** Farm Simulation's own access-code sign-in screen still exists. Decide later whether to hide it for logged-in AgroGuard users.

## Review points not decided yet
These came up in review and still need a decision before building:
1. **Access code and JWT together.** `sim/run` still needs the access code in production, so a user would need both. Should the JWT replace the access code for signed-in users?
2. **Mock checkout switched off by default.** Gate demo-login, mock-checkout and demo reset behind a setting such as `BILLING_MODE=mock` that fails closed when unset.
3. **Test cards only.** In mock mode, accept only the two test card numbers so nobody types a real card into a fake form.
4. **Pro expiry.** Check `current_period_end` when deciding if a user is still Pro.
5. **Who signs the token.** Let only AgroGuard sign tokens, and AgriQuill forwards the user's token to AgroGuard, so AgriQuill needs no secret. A JWT library would be a new dependency and needs approval.
6. **Which routes need a login.** Gate only Farm Simulation runs, or the whole dashboard.
7. **Price and wording.** Show an example price on the Pro card, labelled as an example.
