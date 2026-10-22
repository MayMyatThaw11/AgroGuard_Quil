---
name: verify
description: Phase gate for the farm map feature. Use before calling any farm map phase or build-plan item done, before a commit that changes farm map behaviour, and before a push.
---

# Verify the farm map

1. Run `npm run verify:farm-map` from the `AgroGuard-Unified` folder. Every step must pass. A test that fails only in the full suite still counts as failing (see Known issues in `docs/FARM_MAP_HANDOFF.md`).
2. For a backend item, check that the new code:
   - returns null with a reason when an input is missing, never a filled value
   - labels every number with its provenance
   - keeps every value the build plan marks TO VERIFY labelled TO VERIFY
3. For a new model or filter:
   - It runs in shadow first.
   - Its backtest uses walk-forward splits with no future data. Name the baseline and the number of pairs.
   - It is promoted only when it beats the baseline on the plan's named metric.
4. For a UI change:
   - Take screenshots at 1440 and 375 px with the playwright-core script pattern described in the handoff.
   - Look at each screenshot.
   - Check that key facts show first, details sit behind a disclosure, there is no raw hex in components, icons are Lucide only, and colour is never the only signal.
5. Run a differentiation check: a cited prior-art search, with each claim classified as common, different or no public product found. Never claim superiority without a measured result.
6. Report in SMART form: objective, deliverables, success criteria (met or not met, with evidence), and scope.
