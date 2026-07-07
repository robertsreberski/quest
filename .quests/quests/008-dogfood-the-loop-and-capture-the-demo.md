---
id: 8
title: Dogfood the loop and capture the demo walkthrough
status: in_progress
priority: p0
worker: claude
model: inherit
max_iterations: 8
depends_on: [3, 4, 5, 6, 7]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T14:20:02Z
---

# Dogfood the loop and capture the demo walkthrough

## Objective
Prove the whole loop with quest's own tooling only: orchestrate the remaining
open quests through `/quest:orchestrate` with reviewer verification, capture a
reproducible end-to-end demo, and run the first retro.

## Done when
- [ ] Every remaining open quest in this repo's `.quests/` was worked via the
      orchestrate skill dispatching executors, with checkpoints as evidence.
- [ ] `examples/walkthrough.md` captures a synthetic end-to-end demo
      (plan → dispatch → iterate → complete) on BOTH backends and BOTH
      workers, reproducible from the README alone.
- [ ] quest-reviewer was dispatched before accepting at least one `complete`
      ruling, with findings dispositioned.
- [ ] `/quest:retro` ran over this build's traces and `quest amend` recorded
      at least one evidence-cited amendment (or an explicit "no deltas" entry).
- [ ] the walkthrough's Claude sessions run cheap tiers — orchestrator on sonnet, executor/worker on haiku — with the model flags visible in the captured commands

## Validation loop
```bash
node bin/quest list --json
node bin/quest list --status complete --json
npm test
```

## Constraints
- No external projects involved; synthetic demos use throwaway repos.

## Context
All prior quests. The orchestrate skill's ruling rubric.
Demo model policy (owner, 2026-07-07): walkthrough = sonnet orchestrator + haiku executor; production defaults stay opus/xhigh in config — the demo doubles as proof that tiers are adjustable per dispatch.

## Out of scope
- Release mechanics (quest 9).

## Checkpoints

**Expanded 2026-07-07T13:52:21Z** — same objective; demo should be cheap to reproduce and demonstrate per-quest model tiering
