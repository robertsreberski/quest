---
id: 7
title: OSS hygiene and CI
status: todo
priority: p1
worker: claude
model: inherit
max_iterations: 6
depends_on: [2]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T13:12:31Z
---

# OSS hygiene and CI

## Objective
Public-readiness gates: a GitHub Actions workflow running the full test and
hygiene suite, plus a complete README quickstart and CONTRIBUTING dev loop.

## Done when
- [ ] `.github/workflows/ci.yml` runs on push/PR: `node --test tests/`,
      shellcheck on any shell scripts, both plugin manifest validations
      (valid JSON + required fields), `scripts/check-agent-parity.mjs`,
      the local and github (shimmed) store round-trip gates, and
      `scripts/check-hygiene.mjs` (no personal paths, no private-project
      references in shipped content).
- [ ] README: full quickstart for BOTH harnesses (install, `quest init`,
      plan → work → checkpoint in minutes), CLI overview, runner overview.
- [ ] CONTRIBUTING: `--plugin-dir` dev loop, test commands, release steps.
- [ ] A CI run is green on GitHub.

## Validation loop
```bash
npm test
node scripts/check-hygiene.mjs
node scripts/check-agent-parity.mjs
```

## Constraints
- CI must not require any secrets for the default gates.

## Context
Hygiene rules: quest 1 constraints. Workflow shape: single job, Node 20.

## Out of scope
- Publishing/marketplace listing (quest 9).

## Checkpoints
