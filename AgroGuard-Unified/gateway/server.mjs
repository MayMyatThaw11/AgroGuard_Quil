// Entry point for the shared agricultural platform. AgroGuard's own landing
// page is the one true entry point (it carries the "Open AgriQill IDE"
// action); this just forwards to it and exposes /apps.json and /status.json
// for diagnostics. It does not proxy, rewrite or otherwise change either app.
import { createServer } from 'node:http'
import { loadConfig, probe } from './config.mjs'

const config = loadConfig()
const { host, port } = config.gateway

function publicApps() {
  return Object.fromEntries(
    Object.entries(config.apps).map(([id, app]) => [
      id,
      { label: app.label, description: app.description, url: app.url },
    ]),
  )
}

async function status() {
  const entries = await Promise.all(
    Object.entries(config.apps).map(async ([id, app]) => [
      id,
      { ui: await probe(app.url, app.fingerprint), api: await probe(app.apiUrl) },
    ]),
  )
  return Object.fromEntries(entries)
}

function sendJson(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  try {
    if (path === '/' || path === '/index.html') {
      // Single hop, straight to AgroGuard's own page — it never redirects
      // back here, so this can never loop.
      res.writeHead(302, { Location: config.apps.agroguard.url })
      res.end()
    } else if (path === '/apps.json') {
      sendJson(res, publicApps())
    } else if (path === '/status.json') {
      sendJson(res, await status())
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
    }
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(String(error))
  }
})

server.listen(port, host, () => {
  console.log(`Landing page: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/`)
})
