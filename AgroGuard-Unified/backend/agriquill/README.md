# AgroGuard FastAPI Backend

This folder contains the initial FastAPI backend scaffold for AgroGuard. It provides:

- A FastAPI application factory.
- Versioned routes under `/api/v1`.
- Liveness and API health endpoints.
- Environment-based settings.
- CORS configuration for the React development server.
- PostgreSQL/PostGIS-ready SQLAlchemy session setup.
- Alembic migration configuration.
- Pytest and Ruff configuration.
- VS Code launch and test settings.

Agriculture features such as fields, crops, observations, assessments, alerts, Telegram notifications, and growth simulations should be added as separate feature modules. The scaffold intentionally does not implement those product features yet.

## Quick start on Windows PowerShell

Run these commands from this `fastapi` folder:

1. Create the virtual environment: `python -m venv .venv`
2. Activate it: `.\.venv\Scripts\Activate.ps1`
3. Install dependencies: `python -m pip install -r requirements.txt`
4. Start the API: `python -m uvicorn app.main:app --reload`
5. Open the API documentation: `http://127.0.0.1:8000/docs`

Copy `.env.example` to `.env` and replace its placeholder database credentials. The
real `.env` is ignored by Git. Never commit database connection strings, Telegram
tokens, or other credentials.

## Available endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Minimal liveness check for local tools and deployment probes |
| `GET /api/v1/health` | Versioned API health and environment summary |
| `GET /docs` | Interactive OpenAPI documentation |
| `GET /openapi.json` | OpenAPI contract |

## Quality commands

- Run tests: `python -m pytest`
- Run lint checks: `python -m ruff check .`
- Apply safe formatting: `python -m ruff format .`

## Database migrations

Set `AGROGUARD_DATABASE_URL` in the private local `.env`. For Supabase on an IPv4-only network, copy the Session pooler URI from the project's Dashboard **Connect** panel and keep TLS enabled with `sslmode=require`. Use the direct database endpoint only when the machine has working IPv6 connectivity or the Supabase IPv4 add-on.

Set `AGROGUARD_INITIALIZE_DATABASE=true` only when startup should create missing
tables and seed the demo data. Without it, the API still starts and the health/docs
routes work, while database-backed routes require a configured database.

- Create a migration after adding models: `python -m alembic revision --autogenerate -m "describe change"`
- Apply migrations: `python -m alembic upgrade head`
- View current migration state: `python -m alembic current`

The health endpoints do not require a running database, so the FastAPI setup can be verified before PostgreSQL/PostGIS is installed.

## Recommended next modules

Add one vertical slice at a time in this order:

1. Fields and seeded GIS context.
2. Crop profiles and requirements.
3. Sensor observations.
4. Explainable field assessments.
5. Alerts and Telegram delivery.
6. Growth simulation and demo reset.

## Field rules and pest watching

- **Boundaries.** A field outline whose edges cross (bow-tie, figure-eight) or that encloses almost
  no area is refused: `AGRI-E033` in a contract, a plain error on upload. A declared area more than
  10% away from the drawn one gives `AGRI-W033` (plans use the declared area).
- **Numbers checked.** Every number in a task's title or text must appear in its evidence list. A
  task that fails is held with `UNTRACED_NUMBER:` and `numbers_checked: false`.
- **Travel.** With one crew member (`schedule { crew: 1 }`) or one machine, the scheduler leaves the
  time to get between fields (`travel_kmh`, default 5, TO VERIFY). Gaps under half an hour are not
  modelled because the forecast is hourly. Larger crews are not routed.
- **Blast, shadow.** A leaf-wetness model (`pest.py`) runs beside the daily humidity rule and is
  shown under `shadow.blast`. It creates no tasks until pilot data shows it does better.
- **Leaf blight advisory.** A day with heavy rain and wind gives an inspect-and-ask-your-agronomist
  task. It never names a treatment. Stem borer is not covered: it needs season history we lack.
- Every threshold in `pest.py` is TO VERIFY against local extension guidance.
