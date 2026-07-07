---
id: 11
title: Runner hardening: github-store support and wall-clock session timeout
status: in_progress
priority: p1
worker: claude
model: inherit
max_iterations: 8
created: 2026-07-07T14:28:21Z
updated: 2026-07-07T14:28:56Z
---

# Runner hardening: github-store support and wall-clock session timeout

## Objective
quest-run works against github-backed stores and bounds each worker session with a wall-clock timeout, closing reviewer findings F1 and F3 on quest 5.

## Done when
- [ ] the github-backend refusal in lib/runner.mjs is removed and a live quest reaches complete via quest-run against a github-backed store (scratch repo evidence)
- [ ] a per-session wall-clock timeout (--session-timeout, config default) kills a hung worker and counts the session as stalled; shim-tested with a hanging fake worker
- [ ] `npm test` green including new tests

## Validation loop
```bash
npm test
```

## Constraints
- runner keeps writing records only via the quest CLI; no new dependencies

## Context
Reviewer findings on quest 5 (F1: runner exits 6 on github backend though all its store IO already goes through the backend-agnostic quest CLI; F3: no timeout/kill anywhere in lib/runner.mjs or lib/workers.mjs — grep timeout|kill returns nothing). Scratch repo robertsreberski/quest-scratch-g3 exists for live evidence. Symbols: spawnCapture, runQuest in lib/runner.mjs

## Checkpoints
