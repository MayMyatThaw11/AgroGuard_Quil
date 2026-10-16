# Reconciliation report

How `AgroGuard-Unified` was assembled from the two original repositories
(`AgriBackend/Agriculture` and `agroquill/Agriqill`, both kept untouched as
recovery sources) and the standalone `platform-gateway`. Written during the
merge on 2026-10-16.

## Canonical sources

| Component | Canonical source | Why |
|---|---|---|
| AgroGuard frontend | `AgriBackend/Agriculture/Agri/agriculture/frontend` (working tree, uncommitted changes included) | The actively developed copy — git-tracked, with substantial uncommitted work (crop-suggestion ML feature, NDVI UI) beyond this session's own fixes |
| AgroGuard backend | `AgriBackend/Agriculture/fastapi` (working tree) | Same — scoring, Telegram polling, and the new ML/data work all live here uncommitted |
| AgriQill IDE frontend | `agroquill/Agriqill/AGRIQILL/source/frontend/agriquill-ide` | The real, actively developed AgriQill app — confirmed via its own `npm run dev` wiring; not a fork of AgroGuard |
| AgriQill backend | `agroquill/Agriqill/backend/agriquill` (the package), **not** `backend/app` | `agriquill/` is AgriQill's own code; `app/` is a mirrored, legacy copy of AgroGuard's backend (see below) |

Both source repos had uncommitted changes beyond this session's own edits —
confirmed with `git status`, not assumed — so everything was copied from the
live working trees, never re-cloned from git HEAD (which would have
silently dropped that work).

## Preserved

**AgroGuard** (`apps/agroguard-web` + `backend/agroguard`):
- Scoring/assessment, Telegram polling and alerting, the crop-suggestion ML
  feature (trained model, raw datasets, new endpoints) — all uncommitted
  work in the original, carried over as-is.
- This session's fixes: AgroGuard branding throughout, sprout favicon,
  sidebar layout/responsiveness, the "Open AgriQill IDE" sidebar link,
  existing sign-in/dashboard behavior unchanged.

**AgriQill** (`apps/agriquill-ide` + `backend/agriquill`):
- Telemetry (`telemetry.py`), background jobs (`jobs.py`, `live.py`),
  provider integrations (CHIRPS, NASA POWER, SoilGrids, GLEAM, Global Forest
  Watch, FAOSTAT, Ecocrop), the ledger, MCP tools — moved as-is, untouched.
- This session's fixes: the day-sync infinite-loop fix, WebGL context-loss
  recovery, fetch-failure classification — all already in the working tree,
  carried over.
- Live data: the SQLite stores and the hash-chained JSONL ledger — see
  **Live data migration** below for exactly how, and the validation results.

**Ported in from the embedded `backend/app` copy** (see next section for
what that is and why each of these was/wasn't carried over):
- `app/ml/disease_detection.py` — the real PyTorch disease classifier.
  Canonical's own version was a non-functional stub that always returned
  hardcoded placeholder text; this is a genuine upgrade, not a side-by-side
  alternative.
- `app/services/llm.py` — added `get_disease_advice()` (LLM-generated,
  bilingual treatment/prevention text) and its fallback, merged into
  canonical's file rather than overwriting it, so canonical's existing
  "no API key configured → graceful bilingual fallback" behavior for chat
  and crop-explanation is unchanged.
- `app/api/v1/endpoints/disease.py` — rewired to call the real classifier +
  LLM advice, with bilingual `Accept-Language` handling, instead of
  returning a canned "not configured" response. A missing model/weights
  file now produces a clear `503`/`500` instead of a fake `200 OK`.
- `pyproject.toml` — added `torch`, `torchvision`, `Pillow` (needed by the
  ported classifier; canonical never declared them because its disease
  endpoint never actually ran inference before).

## The embedded `backend/app` copy — investigated, not blindly excluded

`agroquill/Agriqill/backend/app/` is a near-complete mirror of AgroGuard's
own `fastapi/app/` package (85 Python files on both sides), embedded inside
AgriQill's repo. It was part of an experiment to run **both apps in one
FastAPI process**: its `main.py` did `from agriquill import jobs; async with
jobs.background(): ...` inside AgroGuard's own lifespan, and its
`api/v1/router.py` did `from agriquill.api.main import router as
agriquill_router; api_router.include_router(agriquill_router)` — mounting
AgriQill's entire API inside AgroGuard's.

That single-process design is **not** what this workspace uses (two
processes — see below), so the jobs-bridge and router-mount aren't carried
forward. Nothing is lost: AgriQill's own `agriquill.api.main` already runs
`jobs.background()` correctly in its own process, unchanged. File-by-file
diff of the rest of `backend/app` against canonical, in full:

| File | Verdict |
|---|---|
| `ml/disease_detection.py` | **Ported** — see above |
| `services/llm.py` (disease-advice functions) | **Ported** — see above |
| `services/observation.py` (`_bridge_to_agriquill`) | **Not wired up — unresolved, see below** |
| `main.py` (jobs bridge) | Not needed — superseded by the two-process design |
| `api/v1/router.py` (agriquill mount) | Not needed — same reason |
| `core/config.py` (LLM provider defaults) | Canonical's OpenAI default kept; the embedded copy's local-Ollama option is documented in `.env.example` instead of silently dropped |
| `services/telegram.py`, `assessment.py`, `alerting.py`, `schemas/sensor_observation.py` | Canonical is strictly further along (more fields, DB-queried suppression, logging) — embedded is an older snapshot here, nothing unique to port |
| Everything else (identical or trivial path/ordering differences) | No action needed |

### The telemetry bridge — wired up, disabled by default (2026-10-16 update)

`backend/app/services/observation.py` had every AgroGuard sensor reading
also pushed into AgriQill's telemetry store via a **direct in-process Python
import** (`from agriquill import telemetry; telemetry.ingest(...)`). That
only worked because both apps shared one process and memory space.

With two separate processes, the equivalent is an HTTP call to AgriQill's
API. Re-reading AgriQill's actual auth code (`backend/agriquill/agriquill/api/main.py`,
`_reader`/`_named`) rather than assuming: `POST /api/v1/agriquill/telemetry/readings`
checks a `X-AgriQuill-Write-Token` header against either a shared
`AGRIQUILL_WRITE_TOKEN` or named entries in `AGRIQUILL_USERS`
(`name:code:roles[:farms]`). A caller authenticating with a token that has
no associated name gets `Caller(name=None, ...)`, and `_named()` only
checks "the reporter field matches the caller's own name" *when the caller
has a name* — so an unnamed/service caller can submit any `reporter` string
it likes. **The existing design already supports a machine caller; it did
not need a new auth mechanism**, just a credential.

**Owner decision made (default, easy to override)**: authenticate the
bridge as its own dedicated `AGRIQUILL_USERS` entry
(`agroguard-bridge:<token>:crew`) rather than the blanket
`AGRIQUILL_WRITE_TOKEN` — scoped to the `crew` role only (can submit
readings, can never touch manager-only endpoints like contracts), and
individually revocable/auditable. See `backend/agriquill/.env.example` and
`backend/agroguard/.env.example` for the exact variables
(`AGRIQUILL_USERS` / `AGROGUARD_AGRIQUILL_BRIDGE_TOKEN`). If a shared token
or a different credential-management approach is preferred, change the
`.env` values only — no code change needed, both paths use the same header.

**Status**: implemented in `backend/agroguard/app/services/observation.py`
(`_bridge_to_agriquill`, called from `ingest_observation`). Disabled by
default — with `AGROGUARD_AGRIQUILL_BRIDGE_TOKEN` unset it's a no-op, the
same "blank key → fail soft" convention already used for the LLM and
weather integrations — so this ships with **no behavior change** until an
owner opts in by setting that token. A bridge failure is logged and
swallowed, never raised, so it can't break AgroGuard's own ingestion
response. Covered by `backend/agroguard/tests/test_agriquill_bridge.py`
(disabled-by-default no-op, the HTTP call shape/headers, skip-when-nothing-
to-report, and failure-is-swallowed-not-raised) — this replaces the removed
`test_agroguard_bridge_records_temperature_and_humidity`, which exercised
the in-process import that no longer applies under the two-process design.

## Legacy code intentionally excluded

`agroquill/Agriqill/frontend` — a vendored fork of the *same original
AgroGuard frontend scaffold* (`package.json` name `myanglow-frontend`,
identical to canonical's). Diffed file lists: it has exactly two files
canonical doesn't — `AuthModal.jsx`/`AuthContext.jsx`, a demo-only
localStorage auth (plaintext passwords, no backend validation). Read in
full; not real security and not worth porting. Everything else in that
folder is strictly behind canonical (no scoring, no ML, no branding/sidebar
fixes). Active references: exactly two, both in
`agroquill/Agriqill/package.json` (`"frontend"` workspace entry,
`dev:agroguard`/`build:agroguard` scripts) — nothing else in AriQill's
code or docs references it. Canonical's existing sign-in modal behavior is
unchanged; this fork is simply not part of the new workspace.

## Two backend processes, not one

Kept deliberately separate:
- No route or schema overlap to resolve by merging (`/api/v1/*` vs
  `/api/v1/agriquill/*`, Postgres vs local SQLite+JSONL — nothing shared).
- Divergent heavy ML dependency sets (AgroGuard: torch+sklearn for
  crop/disease models; AgriQill: torch+torchvision+ortools+h5py+paramiko
  for geo/MCP tooling) — one process would need the union for no benefit.
- AgroGuard's frontend dev-proxy is hardcoded to `:8000`; changing that
  would mean editing AgroGuard's own `vite.config.js`, which the "two
  processes are acceptable" clarification didn't ask for.
- Independent crash domains and independent ownership matter for a team
  splitting work by component (see the README's ownership table).

No database migration was performed or needed — AgroGuard's Postgres and
AgriQill's SQLite+ledger remain exactly as they were, each under its own
process.

## Live data migration

Per the explicit safety requirements: writers were stopped first (all five
dev processes, confirmed via `netstat` showing every port silent) before
touching any data file.

**SQLite stores** (`cache.sqlite`, `contracts.sqlite`, `telemetry.sqlite`):
each was checkpointed (`PRAGMA wal_checkpoint(TRUNCATE)`, merging any
pending WAL content into the main file) then copied via SQLite's own
`Connection.backup()` API — not a raw file copy, which can race with
WAL/SHM state. Verified afterward with `PRAGMA integrity_check` (all `ok`)
and a per-table row-count comparison against the source (all matched:
`cache` 3/3, `contracts` 0/0, `telemetry` 0/0).

**Ledger** (`agriquill_ledger.jsonl`, 32 entries): copied byte-for-byte, then
validated using the ledger's own `Ledger.verify()` method (walks the
SHA-256 hash chain from `GENESIS`) on **both** the original and the copy —
both report `verify() == True`, and their `head_hash()` values match
exactly. (First validation attempt used git-bash-style paths passed as
Python string literals, which Python doesn't translate the way it does for
shell-invoked argv — that silently "verified" an empty, 0-entry chain. Caught
and redone with explicit Windows paths before trusting the result.)

Originals were not deleted or altered beyond the checkpoint itself (which
only consolidates WAL content into the main file — a normal, non-destructive
operation the database would perform on its own; it does not change the
logical contents of any row). The new workspace and the original repos were
never run against the same writable data simultaneously.

## Environment reproducibility

`backend/agriquill` has its own self-contained `pyproject.toml` (package
`agriquill-api`, no path dependency on either original repo or on
`platform-gateway`) — a teammate on a fresh machine follows the README's
"One-time setup" step 2 exactly as written: `python -m venv .venv` inside
`backend/agriquill`, then `pip install -e ".[dev,mcp]"`. That is the
reproducible, independent setup.

Separately, as a **local, this-machine-only convenience** during this
reconciliation session, test runs against `backend/agriquill` reused the
already-installed `platform-gateway/.venv-agriquill` virtualenv (it has the
same dependency set, including the slow-to-install `torch`/`torchvision`/
`ortools` stack) rather than building a fresh `.venv` from scratch each
time. `backend/agriquill` has no `.venv` of its own in this workspace yet —
run the README's setup steps to create one; don't assume the
`platform-gateway` venv is meant to be shared going forward. Also added
`backend/agriquill/.env.example` (missing even in the original repo, so
the README's "copy .env.example .env" step 2 was previously referring to a
file that didn't exist) documenting `AGRIQUILL_WRITE_TOKEN`/`AGRIQUILL_USERS`.

### Update (2026-10-17): this is the one real remaining dependency

Before archiving the original repos, a full dependency audit (startup
scripts, interpreter resolution, venvs, `node_modules` for
symlinks/junctions, every config file, runtime-data paths) found exactly
**one** live dependency on anything outside `AgroGuard-Unified`:
`backend/agriquill` still has no `.venv` of its own, so `agriquill-api`
needs an interpreter pointed at `platform-gateway/.venv-agriquill`.

**Follow-up (2026-10-17, same day): `npm run start` resolves this on its
own now**, without a manually-exported env var each session. It was
silently falling back to a bare `python` on PATH when nothing else
matched — which has none of this backend's dependencies and fails deep
inside uvicorn (`ModuleNotFoundError: paramiko`) instead of with a clear
message. `gateway/start-all.mjs`'s `resolvePython()` now: checks
`AGRIQUILL_PYTHON`/`AGROGUARD_PYTHON` (settable in `gateway/.env`,
gitignored, loaded by `gateway/config.mjs` — see `gateway/.env.example`)
and requires it to exist if set; otherwise checks that backend's own
`.venv`; if neither exists, it **fails immediately with a setup message
naming the missing path**, instead of starting with a broken interpreter.
This machine's `gateway/.env` is set to
`AGRIQUILL_PYTHON=D:\Agriculture-Merge\platform-gateway\.venv-agriquill\Scripts\python.exe`.
Verified: `npm run start` with no manual env var resolves and logs both
interpreters correctly, `paramiko` imports cleanly from that interpreter,
`/api/v1/agriquill/health` and `/api/v1/health` both answer `200`, and a
deliberately-broken `AGRIQUILL_PYTHON` fails fast with the setup message
instead of starting anything.

Everything else checked clean: no symlinks/junctions anywhere in the
workspace (`Get-ChildItem -Attributes ReparsePoint` found none), no
`AgriBackend`/`agroquill`/`platform-gateway` path strings in any script,
config, `pyproject.toml`, `package.json`, or `.env` file, and
`backend/agroguard`'s own `.venv` editable-install
finder maps only to its own path.

Building `backend/agriquill` its own `.venv` was deferred at the owner's
choice — it requires installing `torch`, `torchvision`, `ortools`,
`paramiko`, `h5py`, `fastmcp` (installed size in the existing venv: torch
~500MB, ortools ~81MB), which is a real download even though a local pip
cache may cover part of it. **Until that `.venv` is created, `platform-gateway`
is not safe to remove** — `backend/agriquill` cannot start or run its
tests without it (or some other Python environment with the same
packages). `AgriBackend` and `agroquill` have no such live dependency; see
the archive recommendation below.

## Secrets found and handled

Two **pre-existing** secrets-in-tracked-files issues were found in the
original repositories (not introduced this session, not fixed there —
`AgriBackend/Agriculture` and `agroquill/Agriqill` were not altered):

1. `AgriBackend/Agriculture/fastapi/.env.example` — a real Supabase Postgres
   connection string (with password) sitting in the *uncommitted* working
   tree of a tracked file. Checked `git show HEAD:...` — the committed
   version only has a safe `localhost` placeholder, so this specific value
   was not yet in git history. Recommend not committing it there as-is.
2. `agroquill/Agriqill/backend/keys.env` — real GFW/FAOSTAT/GLEAM
   credentials in a file that **is** tracked in git history already (the
   `.gitignore` rule for it was added after the file was first committed).
   Recommend rotating these credentials given the history exposure,
   independent of anything done here.

Neither value was printed in any report. In this workspace: both went into
gitignored `.env`/`keys.env` files (verified against the new root
`.gitignore` — `.env`, `.env.*`, `keys.env` are all ignored, with
`!.env.example`/`!keys.env.example` carved out); the tracked
`.env.example`/`keys.env.example` templates hold only placeholders.

## Unresolved items (summary)

1. **Telemetry bridge** — implemented and tested, disabled by default; see
   the dedicated section above. Enabling it in any given deployment is an
   owner choice (set one `.env` token), not a code change.
2. **Browser-interactive verification** — see the verification report for
   exactly what was checked by automated tests/builds vs. what still needs
   a human (or a browser tool) to click through.
3. **Disease detection and AI chat are owned by other team members** —
   out of scope for this consolidation task; their code was moved as-is
   and not modified further. See "Module handoff" below for their current
   status, exactly as inherited.

## Module handoff: Disease detection and AI chat

Assigned to other team members — not implemented, configured, trained, or
fixed in this task. Code preserved exactly as ported/carried over
(see "Ported in from the embedded `backend/app` copy" above for disease
detection's provenance). Status below is for handoff, not a judgment that
either is "done":

**Disease detection** (`app/ml/disease_detection.py`,
`app/api/v1/endpoints/disease.py`):
- Code is real (ResNet18 + torchvision pipeline) and wired into
  `POST /api/v1/disease-detect`, but `app/ml/artifacts/disease_model.pth`
  doesn't exist anywhere in either original repo (only
  `disease_classes.json` does) — nothing to train on was carried over
  either.
- Current behavior on a request: `predict_image` raises a plain
  `Exception("Model files not found. Please train the model first.")`,
  which the endpoint maps to a generic **`HTTP 500`** — indistinguishable
  from an actual inference bug. Whoever picks this up may want to give the
  missing-weights case its own status code/detail before anything else;
  not done here since it touches the module's logic.
- To make it work: train a model into that exact path (see
  `app/ml/README.md` if present for the expected class-label format) or
  supply existing weights, then re-test with a real image.

**AI chat** (`app/services/llm.py`, `/api/v1/chat`, `/api/v1/crop-explanation`):
- Code is complete and was not touched. With `AGROGUARD_LLM_API_KEY` set
  (any OpenAI-compatible `/chat/completions` endpoint, including a local
  Ollama server — see `.env.example`), it streams real LLM output.
- With the key blank (its current state in this workspace's `.env`), it
  streams a templated bilingual fallback response instead of erroring —
  by design, same convention as the weather integration. This is a
  configuration gap, not a code defect: set the key to get real answers.
- Exercised by the pre-existing `tests/test_streaming_api.py`, which
  passes either way since it only asserts the no-key fallback shape.

## Test accounting

Recomputed from scratch this session by running every original and
unified test suite directly (not inferred) — using each repo's own
`pytest --collect-only`/full run, with `--basetemp` pointed at a writable
directory to work around an unrelated pre-existing Windows permission
problem on the default pytest temp dir:

| Location | Tests | Result |
|---|---|---|
| `AgriBackend/Agriculture/fastapi` (original) | 16 | 16 passed |
| `agroquill/Agriqill/backend` — `agriquill`-package tests (original) | 270 | 270 passed |
| `agroquill/Agriqill/backend` — embedded `backend/app` mirror's own copies of 4 of AgriBackend's test files (original; same test bodies, run against the stale mirror) | 8 | 6 passed, 2 failed (mirror's local-Ollama-shaped LLM default tries a real network connection and fails in this sandbox — pre-existing, environment-dependent, not present in canonical AgroGuard's own copy of the same tests, and not carried into this workspace) |
| `platform-gateway` (original) | 0 | no pytest suite (Node landing page; `verify.mjs` is a manual smoke script, not a test suite) |
| **`AgroGuard-Unified/backend/agroguard`** | **20** | **20 passed** (16 carried over unchanged + 4 new bridge-adapter tests) |
| **`AgroGuard-Unified/backend/agriquill`** | **269** | **269 passed** (270 carried over, minus 1 intentionally removed) |

Counting the original repos' *logically distinct* tests once each (the 8
embedded-mirror duplicates test code that was never carried forward as a
separate copy — only 3 specific files were cherry-picked out of that
mirror into canonical AgroGuard, per the table above): **286 distinct
original tests, all passing** (16 + 270). The unified workspace has **289
passing tests**: 286 − 1 removed + 4 added = 289.

The one test removed, `test_agroguard_bridge_records_temperature_and_humidity`
in `test_agriquill_telemetry.py`, exercised the direct in-process import
(`from app...; from agriquill import telemetry`) that only works in the
embedded single-process mirror — it has no two-process equivalent to keep
running as-is. It's superseded by
`backend/agroguard/tests/test_agriquill_bridge.py` (4 tests).

Disease detection and AI chat are out of scope for this task (see "Module
handoff" above) — no test was added, changed, or removed for either.

This session could not reconcile these figures against the "228 original /
219 final" counts in an earlier review request — that count wasn't
produced by this session and nothing in the workspace documents how it
was derived. The numbers above are freshly verified by direct test
execution, not inferred from an earlier report; if the 228/219 figures
came from a different scope (e.g. a partial collection, or counting the
embedded mirror differently), flag it and this table can be reconciled
against whatever that scope was.

## Live verification (2026-10-16)

Beyond the automated test suites above, the actual documented root
commands were run against a live stack, not just read:

- **Folder structure**: no leftover duplicate code — `backend/agriquill`
  has no `app/` mirror folder (the embedded copy was never carried over as
  a duplicate, only 3 specific files were cherry-picked into canonical
  AgroGuard — see above), and a source-wide search of `apps/*/src`,
  `backend/*/app`, `backend/*/agriquill`, and `gateway/` turned up no
  references to either original repo's path.
- **Frontend builds**: `npm run build` succeeds in both
  `apps/agroguard-web` (vite build, 1853 modules) and `apps/agriquill-ide`
  (`tsc --noEmit && vite build`, 2753 modules, no type errors).
- **Startup/shutdown via the documented root commands**: `npm run start`
  from the workspace root (with `AGRIQUILL_PYTHON` pointed at the reused
  convenience venv, since `backend/agriquill` has no `.venv` of its own
  yet — see "Environment reproducibility" above) brought up all five
  processes cleanly. `npm run stop` took them all back down; verified with
  `netstat` that all five ports (3000, 4000, 5173, 8000, 8010) were free
  afterward.
- **`npm run verify`**: all 14 checks passed against the live stack —
  gateway redirect, both frontends' identity, both APIs' health, the
  landing-page/sidebar action split, and that neither frontend's `/api`
  proxy reaches the other backend.
- **Telemetry bridge, end to end**: AgroGuard's own `/api/v1/*` endpoints
  that would exercise this (e.g. `/demo/scenarios`, `/regions`) returned
  500s against the live stack — the configured
  `AGROGUARD_DATABASE_URL` (a real Supabase Postgres credential, already
  flagged under "Secrets found and handled") isn't reachable from this
  environment, which blocks any DB-backed request, not just this one.
  To still verify the bridge itself (not blocked on the database), its
  `_bridge_to_agriquill` function was called directly against the live
  `agriquill-api` process with a bridge token set, bypassing the
  DB-dependent AgroGuard endpoint. Result: AgriQill's
  `/telemetry/latest` confirms both values landed with
  `"reporter":"agroguard-bridge"` and correct units/hashes — the HTTP
  call, header, payload shape, and AgriQill-side auth/ingest all work as
  designed. **Remaining configuration to turn this on for real traffic**:
  set `AGROGUARD_AGRIQUILL_BRIDGE_TOKEN` (AgroGuard's `.env`) and a
  matching `AGRIQUILL_USERS` entry (AgriQill's `.env`) — see both
  `.env.example` files; with AgriQill's own `.env` currently unset
  (`AGRIQUILL_WRITE_TOKEN`/`AGRIQUILL_USERS` both blank = open dev mode,
  `sign_in_required: false`), *any* non-empty bridge token works today,
  but that's a dev-only default, not something to rely on past local
  testing. One harmless test reading (`device_id: "agroguard:999999"`)
  was left in AgriQill's live `telemetry.sqlite` from this check; it's
  inert demo-shaped data, not removed because the telemetry store is
  hash-chained into the ledger and deleting rows out-of-band isn't worth
  the risk for one test row.
- **Noted, not fixed (unrelated to this task)**: on startup, AgroGuard's
  Telegram polling logged `401 Unauthorized` — the bot token in `.env` is
  invalid/expired. Non-fatal (the app continues), pre-existing, and
  unrelated to the merge; flagging it for whoever owns Telegram alerting.

No git repository exists yet anywhere under this workspace or its
parents, so nothing was committed, pushed, or deployed at any point
during this verification.

## Archive readiness (2026-10-17)

A full backup of all three original folders — git history, uncommitted
changes, and local `.env`/`keys.env` files intact — now exists at
`D:\Agriculture-Merge-Backup\` (outside the active workspace), made with
`robocopy /E /COPY:DAT` (data + attributes + timestamps; owner/ACL/audit
flags were skipped — they need admin rights and aren't needed for a
restore). Verified: both `.git` repos in the backup report the same
commit and the same uncommitted-file counts as their originals (25 and 11
files respectively); the `.env`/`keys.env` files are present; nothing was
deleted at the source. **Nothing has been removed — this is a backup
only, pending your go-ahead to delete the originals.**

Per-folder verdict:

| Folder | Safe to remove now? | Why |
|---|---|---|
| `AgriBackend` | **Yes** | Backed up. No live code, config, or runtime dependency from `AgroGuard-Unified` found anywhere. |
| `agroquill` | **Yes** | Backed up. Same — no live dependency found. (Its `AuthModal`/`AuthContext` demo-auth fork, the only code not carried over, was read in full during the original merge and judged not worth porting — see "Legacy code intentionally excluded" above.) |
| `platform-gateway` | **Not yet** | Backed up, but `backend/agriquill` still runs on `platform-gateway/.venv-agriquill` (no `.venv` of its own exists in the unified workspace). Removing it now would break `agriquill-api` start/tests. Build `backend/agriquill`'s own `.venv` first (README "One-time setup" step 2 — needs the torch/torchvision/ortools install this session deferred), confirm the unified stack starts without `AGRIQUILL_PYTHON` pointed outside the workspace, *then* this folder is safe to remove too. |

Everything else requested was completed independent of that one
dependency: the full dependency audit (scripts, venvs, `node_modules`,
configs, runtime-data paths) is above; `backend/agroguard` builds, tests
(20/20), starts, and stops using only its own `.venv` — no original-repo
or `platform-gateway` involvement; the telemetry bridge remains disabled
by default (`AGROGUARD_AGRIQUILL_BRIDGE_TOKEN` unset).
