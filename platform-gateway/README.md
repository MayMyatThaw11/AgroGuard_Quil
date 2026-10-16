# Agriculture Platform gateway

`localhost:4000` forwards, in a single hop, straight to AgroGuard's own landing
page. That page is the one true entry point. AgroGuard's dashboard sidebar
(after signing in) carries an **Open AgriQill IDE** action, below the nav
items and above the language selector. This gateway does not change, proxy,
copy or replace either application, and it has no npm dependencies.

This phase is a shared entry point only. The two applications keep separate users,
databases, farms and sensor data. Shared data and cross-application workflows are
future integration work.

## What it opens

| Action | URL | Project | Started by |
|---|---|---|---|
| (forwarded to) AgroGuard's landing page | http://localhost:5173/ | `../AgriBackend/Agriculture` (the current AgroGuard, with its uncommitted work) | its own `npm run dev` (FastAPI :8000, Vite :5173) |
| "Open AgriQill IDE" in AgroGuard's dashboard sidebar | http://localhost:3000/ | `../agroquill/Agriqill` | its own `npm run dev --workspace=agriquill-ide` (Vite :3000) |

The older AgroGuard copy inside AgriQill (`agroquill/Agriqill/frontend`, `npm run dev:agroguard`)
is **not** used. `npm run verify` checks for this. Both copies now title themselves
"AgroGuard"; the real one is distinguished by an `application-name` meta tag
this fix added to its `index.html`, which the untouched old copy does not have.

## Ports

| Port | Service |
|---|---|
| 4000 | This landing page |
| 5173 | AgroGuard frontend (Vite default) |
| 8000 | AgroGuard API (its default; its Vite proxy is fixed to `localhost:8000`) |
| 3000 | AgriQill IDE |
| 8010 | AgriQill API |

Both APIs default to port 8000. AgroGuard's proxy cannot be changed without editing
AgroGuard, so the AgriQill API runs on 8010 instead. AgriQill's IDE already supports this
through its `AGRIQUILL_API_TARGET` variable, which `start-all.mjs` sets. No file in
either project is edited.

## Run

```powershell
cd D:\Agriculture-Merge\platform-gateway
npm run start:all     # both apps + landing page; Ctrl+C stops everything
# open http://localhost:4000/
npm run verify        # in a second terminal, while start:all is running
```

`npm run start` serves only the landing page. Use it if you start the apps yourself.

### One-time setup

- AgroGuard uses its existing `fastapi/.venv` and `node_modules` as they are.
- AgriQill API uses `platform-gateway/.venv-agriquill`, a separate Python environment
  holding the dependencies from `backend/pyproject.toml`. It lives outside the AgriQill
  folder so nothing inside it changes. Set `AGRIQUILL_PYTHON` to use another interpreter.
- AgriQill npm packages: run `npm ci` in `agroquill/Agriqill` (installs into the
  gitignored `node_modules`).

## Direct URLs and original start commands

Nothing changes in either project. `npm run dev` in AgroGuard and `npm run dev:full` in
the AgriQill IDE still work as before. Both use port 8000 for their API, so run only one
of those two at a time, or use `start:all`.

## Files

| File | Purpose |
|---|---|
| `gateway.config.json` | App URLs, labels, ports and page fingerprints |
| `server.mjs` | Redirects `/` to AgroGuard's landing page; serves `/apps.json` and `/status.json` (running checks) |
| `start-all.mjs` | Starts both applications with their own commands, plus this gateway |
| `verify.mjs` | Checks that the entry point and both actions reach the correct running application |
