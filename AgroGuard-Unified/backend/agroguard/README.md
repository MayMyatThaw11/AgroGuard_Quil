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

## AI chat (Groq)

`POST /api/v1/chat` streams answers from Groq's free tier through its
OpenAI-compatible API (`app/services/llm.py`).

1. Create a free key at https://console.groq.com/keys.
2. Put it in the private `.env` as `AGROGUARD_LLM_API_KEY=...`. Never put it
   in `.env.example`, which is committed.
3. Restart the API after changing `.env`.

| Setting | Default | Purpose |
|---|---|---|
| `AGROGUARD_LLM_ENDPOINT` | `https://api.groq.com/openai/v1` | Any OpenAI-compatible endpoint (Ollama works too) |
| `AGROGUARD_LLM_MODEL` | `openai/gpt-oss-120b` | Model that writes the answers |
| `AGROGUARD_LLM_TOPIC_GUARD_ENABLED` | `true` | Turns the farming-only check on or off |
| `AGROGUARD_LLM_TOPIC_GUARD_MODEL` | `openai/gpt-oss-20b` | Small model used for that check |

Groq retires models from the free tier from time to time (the Llama 3.x
models went on 2026-08-16). A `404 Not Found` from the chat usually means the
model name is no longer available; check
https://console.groq.com/docs/deprecations and update the two model settings.

**Farming-only guardrails.** The chat only answers farming questions (crops,
livestock, fisheries, soil, irrigation, pests and diseases, farm weather,
machinery, selling produce):

- Both system prompts (English and Burmese) carry the scope rules, refuse
  other topics, and ignore requests to override them.
- `app/services/topic_guard.py` asks the small model to label each new
  question FARMING or OTHER before the main model runs. Off-topic questions
  get a fixed polite refusal, in Burmese if the question is written in
  Burmese, and the main model is never called. If the check itself fails,
  the question goes through and the system prompt still applies.
- Only the last 12 messages, each capped at 4,000 characters, are sent.

Answers are asked for in a short, plain format (a direct answer, then up to
five numbered points). The web app renders them with
`apps/agroguard-web/src/components/ChatMessageText.jsx`, which turns the
model's Markdown into lists and bold labels and hides stray symbols.

Tests: `python -m pytest tests/test_chat_guardrails.py`.

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

### Telegram bot

Create the bot with BotFather and put the complete token in
`AGROGUARD_TELEGRAM_BOT_TOKEN`. Set `AGROGUARD_TELEGRAM_CHAT_ID` to the allowed
chat ID and keep `AGROGUARD_TELEGRAM_POLLING_ENABLED=true` for `/start` and
`/help` responses. Only one running API worker should poll a bot token at a time.
If Telegram returns HTTP 404 from `getMe`, the token is invalid or incomplete and
must be regenerated in BotFather.

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
