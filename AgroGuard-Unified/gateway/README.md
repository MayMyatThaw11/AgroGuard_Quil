# Gateway

`localhost:4000` forwards, in a single hop, straight to AgroGuard's own
landing page (`apps/agroguard-web`, port 5173) — the one true entry point.
AgroGuard's dashboard sidebar (after signing in) carries an "Open AgriQill
IDE" link. This gateway does not change, proxy, copy or replace either
application, and it has no npm dependencies of its own.

## What it opens

| Action | URL | Started by |
|---|---|---|
| (forwarded to) AgroGuard's landing page | http://localhost:5173/ | `apps/agroguard-web`'s own `npm run dev` |
| "Open AgriQill IDE" in AgroGuard's dashboard sidebar | http://localhost:3000/ | `apps/agriquill-ide`'s own `npm run dev` |

## Ports

| Port | Service |
|---|---|
| 4000 | This gateway |
| 5173 | AgroGuard frontend (Vite default) |
| 8000 | AgroGuard API (its frontend's dev-proxy is hardcoded to this port) |
| 3000 | AgriQill IDE |
| 8010 | AgriQill API (not its own 8000 default — see above) |

## Run

```powershell
cd gateway
npm run start:all     # all 5 processes; Ctrl+C stops everything
# open http://localhost:4000/
npm run verify         # in a second terminal, while start:all is running
```

## Files

| File | Purpose |
|---|---|
| `gateway.config.json` | App frontend/backend dirs, URLs, labels, fingerprints |
| `server.mjs` | Redirects `/` to AgroGuard's landing page; serves `/apps.json` and `/status.json` |
| `config.mjs` | Loads the config, resolves paths, probes app health |
| `start-all.mjs` | Starts all 5 processes (2 frontends, 2 backends, this gateway) |
| `verify.mjs` | Checks the redirect, both apps' identity, both APIs, and proxy routing |
