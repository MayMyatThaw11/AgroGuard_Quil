# AgroGuard_Quil

Two folders, published together:

- **[`AgroGuard-Unified/`](AgroGuard-Unified/)** — the active project: AgroGuard
  (sensor monitoring, crop scoring, disease detection, AI chat) and AgriQill
  IDE (farm contracts, water planning, twin rehearsal, field app), as one
  team-ready workspace. Start here — see its own
  [README](AgroGuard-Unified/README.md) for setup, running, and
  [`docs/RECONCILIATION.md`](AgroGuard-Unified/docs/RECONCILIATION.md) for
  how it was assembled and what's still open.
- **[`platform-gateway/`](platform-gateway/)** — the original standalone
  landing-page gateway this workspace's own `gateway/` superseded. Kept for
  reference; not part of the active startup path.

## Recreating the AgriQill backend environment

`AgroGuard-Unified/backend/agriquill` has no committed virtual environment
(by design — `.venv`/`.venv-agriquill` are never committed). To run it:

```powershell
cd AgroGuard-Unified/backend/agriquill
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev,mcp]"
copy .env.example .env
copy keys.env.example keys.env
```

That creates everything `npm run start` needs on its own — no further
configuration required. If you intentionally want to point at a different
interpreter (e.g. one you already have set up elsewhere), see
`AgroGuard-Unified/gateway/.env.example`: set `AGRIQUILL_PYTHON` (or
`AGROGUARD_PYTHON`) there. That file is gitignored — it's for your machine
only, and startup fails with a clear message if the path you set doesn't
exist, rather than silently falling back to a broken interpreter.
