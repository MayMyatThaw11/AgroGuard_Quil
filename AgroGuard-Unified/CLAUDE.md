@AGENTS.md

## Claude Code only
- Before calling a phase done, run the `verify` skill in `.claude/skills/verify`.
- `.claude/hooks/block-dangerous-command.mjs` blocks force pushes, `rm -rf`, `git reset --hard`, skipped hooks and staging env files. Do not work around it.
