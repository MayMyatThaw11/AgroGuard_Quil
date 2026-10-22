#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const ENV_FILE = /(^|[\s/\\])(\.env(\.(?!example\b)[\w-]+)?|keys\.env|doc_\S*\.env)(\s|$)/

const RULES = [
  [/git\s+push\b[^\n]*(--force\b|--force-with-lease\b|\s-f\b)/, 'force push'],
  [/\brm\s+-[a-z]*(rf|fr)/i, 'rm -rf'],
  [/Remove-Item\b(?=[^\n]*-Recurse)(?=[^\n]*-Force)/i, 'recursive forced delete'],
  [/git\s+reset\s+--hard/, 'git reset --hard'],
  [/--no-verify\b|--no-gpg-sign\b/, 'skipping hooks or signing'],
  [/git\s+add\s+(-A|--all|\.)(\s|$)/, 'staging everything; stage explicit paths'],
]

export function verdict(command) {
  const hit = RULES.find(([pattern]) => pattern.test(command))
  if (hit) return hit[1]
  if (/git\s+add\b/.test(command) && ENV_FILE.test(command.replace(/^.*?git\s+add\b/s, ' '))) return 'staging an env file'
  return null
}

if (process.argv[2] === '--self-test') {
  const blocked = [
    'git push --force origin x',
    'git push -f',
    'rm -rf build',
    'git reset --hard HEAD',
    'git commit --no-verify -m x',
    'git add backend/agroguard/.env',
    'git add backend/agriquill/keys.env',
    'git add ../doc_keys.env',
    'git add .env.local',
    'git add -A',
    'Remove-Item -Recurse -Force dist',
  ]
  const allowed = [
    'git push origin farm-simulation',
    'git add backend/agriquill/agriquill/live.py',
    'git add backend/agriquill/keys.env.example .env.example',
    'rm build/a.txt',
    'git status',
  ]
  const wrong = [...blocked.filter((c) => !verdict(c)), ...allowed.filter((c) => verdict(c))]
  if (wrong.length) {
    console.error('self-test failed:', wrong)
    process.exit(1)
  }
  console.log(`self-test passed (${blocked.length} blocked, ${allowed.length} allowed)`)
  process.exit(0)
}

let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8').replace(/^﻿/, '') || '{}')
} catch {
  process.exit(0)
}
const reason = verdict(String(input?.tool_input?.command ?? ''))
if (reason) {
  console.error(`Blocked by .claude/hooks/block-dangerous-command.mjs: ${reason}.`)
  process.exit(2)
}
