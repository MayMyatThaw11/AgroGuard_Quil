# Agent support build plan

Source: `agentsupport.md` (owner, 23 Oct). Owner decision on 23 Oct: build all 5 phases. torch, onnxruntime and google-cloud-bigquery are approved. BigQuery needs a GCP project from the owner.

## Status on 23 Oct
- Phases 1 to 4 are built: the vault, dawn sync, council records and the Field notes panel.
- Phase 5 stopped by the owner (farm map work only): `plant_disease_detection/app/ml/evaluation.py` (held-out accuracy, balanced accuracy, per-class recall and precision, confusion matrix) is written and tested, but not yet called from `train_pytorch_groups.py`. The gatekeeper rejection rate and all BigQuery work are not started.

## What already exists
| Spec pillar | Already in the code | Gap |
| --- | --- | --- |
| Local vault (pillar 1) | SQLite `RecordCache` (`agriquill/store.py`), SHA-256 ledger (`agriquill/ledger.py`), contracts (`agriquill/contract.py`) | No Markdown files, no human and machine zones |
| Council (pillar 2) | `council/deterministic_engine.py` (Invariants A, B, C, 3x ROI rule), `subagents_council.py`, `council/orchestrator.py` | Deliberations are not written to a file or chained in a ledger |
| Backend jobs (pillar 3) | `agriquill/jobs.py` scheduler, `data/nasapower.et0`, `fusion.kalman_depth`, `/metrics`, breakers, caches | No dawn job that updates a farm file |
| Vision (pillar 4) | `plant_disease_detection/1_scripts/train_gatekeeper.py`, `train_pytorch_groups.py` (ONNX export), 5 trained ONNX group models | No held-out evaluation written next to each model |
| BigQuery (pillar 5) | None | Everything |

## Rules that hold for every phase
- **One source of truth.** The vault is a projection of the SQLite records and the ledger, not a second database. Markdown cannot give ACID writes with several writers, so the spec's "ACID-compliant" claim is not carried over.
- **No invented numbers.** The spec's example values (price 480 USD/t, VPD 0.45 kPa, budget 50 USD/ha, 7.5 ha/h drone) are examples only. Every front-matter value comes from a record, a fetched source or the farmer, with its provenance, or it is null with a reason.
- **The 3x ROI ceiling is owner policy, not research.** It stays labelled as policy (TO VERIFY), as it is in `deterministic_engine.py`.
- **Human zone.** Code never writes to `vault/human/`. Only the farmer's own POST (with the write token) adds a file there, and nothing edits or deletes one.
- New models run in shadow until they beat their baseline on walk-forward splits.

## Phase 1: vault foundation
- `agriquill/vault.py`: Pydantic front-matter models (`FarmFile`, `PaddyEntry`), a render function and a parse function. YAML through `yaml.safe_dump` and `yaml.safe_load`. pyyaml is declared in `pyproject.toml`; today it is only a transitive dependency.
- Layout under `settings.data_dir / "vault"`: `farms/`, `daily/`, `human/scouting_notes/`, `human/verification_checks/`, `machine/kalman_water_bands/`, `machine/model_evals/`, `contracts/`, `council/`, `AGENTS.md`.
- File writes are atomic (temp file, then `os.replace`), and every write appends a ledger entry with the file's sha256.
- Tests: front matter round-trips; a missing value renders as null with a reason; code that writes into `human/` raises an error; the ledger hash matches the file.

## Phase 2: dawn sync
- A `vault_sync` job in `jobs.py`. For each onboarded farm it reuses the cached weather, `nasapower.et0` and `fusion.kalman_depth`, then rewrites the farm file's front matter and appends one dated line to its body and to `daily/YYYY-MM-DD.md`.
- It runs on the existing scheduler. A run at 05:00 local time is a scheduler setting, not a second runner. `python -m agriquill.jobs vault_sync` runs it once.
- A failing source leaves its field null with the reason, and the breaker state is recorded. The run still writes the rest.
- Tests: a farm with no tube readings gets a null depth band with its reason; two runs on one day add no duplicate line.

## Phase 3: council bridge
- After `evaluate_pre_harvest_council` and the orchestrator return, write the verdict, the deterministic facts and any `CIRCUIT_BREAKER_INTERCEPT` to `vault/council/<farm>/<timestamp>.md`, and chain it in the ledger.
- No change to the vetoes themselves. Invariants A, B and C stay in `deterministic_engine.py`, with tests showing a veto is written as a veto.
- The cross-service call goes AgroGuard → AgriQill `POST /farms/{id}/vault/council` with the service token, so only one process writes the vault.

## Phase 4: farm map
- `GET /farms/{id}/vault` (the farm file as Markdown and as parsed JSON), `GET /farms/{id}/vault/daily`, `POST /farms/{id}/vault/scouting` (a human note, write token, 4 KB limit, text only).
- In `OwnFarmDetail`: a "Field notes" section (the latest notes plus a form) and a "Farm file" download. All text goes through `t()` in all 7 languages.
- Tests: an API round-trip; a note larger than the limit is refused; the panel shows null reasons.

## Phase 5: vision evaluation and BigQuery
- **Vision.** `train_pytorch_groups.py` writes held-out accuracy, a per-class confusion matrix and the gatekeeper's out-of-distribution rejection rate to `trained_models/<group>/eval.json`, and the vault mirrors it in `machine/model_evals/`. No new architecture: MobileNetV3 or YOLO26n only replaces the current model if it beats it on the same held-out split.
- **BigQuery.**
  - `agriquill/bq.py` runs only when `AGRIQUILL_BQ_PROJECT` is set; otherwise the routes return 503 with the reason.
  - Exports: tube readings, ledger entries and daily weather into date-partitioned tables.
  - SQL templates for `ML.FORECAST` (ARIMA_PLUS), `ML.DETECT_ANOMALIES` and `VECTOR_SEARCH`, written against the BigQuery docs fetched at build time, not from the spec's snippets.
  - BigQuery forecasts run in shadow beside the existing forecast backtest. They are shown only after they beat persistence on 30 or more pairs.
- **Tests:** eval.json schema; BigQuery code runs against a fake client in tests, with no network.

## Gate after each phase
- Backend: pytest, ruff check, ruff format --check, mypy. Frontend: typecheck, test:farm-sim. Then `npm run verify:farm-map`.
- Screenshots at 1440 and 375 px for Phase 4.
- A commit per phase, pushed to `farm-simulation`.

## Needs the owner
- A GCP project and a service account for Phase 5 BigQuery. The code ships behind the flag until then.
- A labelled held-out photo set per crop group, if the current splits are not to be reused.
