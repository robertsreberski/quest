---
id: 8
title: Dogfood the loop and capture the demo walkthrough
status: complete
priority: p0
worker: claude
model: inherit
max_iterations: 8
depends_on: [3, 4, 5, 6, 7]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T15:11:45Z
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

<!-- quest:checkpoint -->
### 2026-07-07T15:11:45Z — quest_status: complete
- iteration: 1
- changed: orchestrated the whole build via the loop; walkthrough captured (both backends x both workers, sonnet/haiku tiers); reviewer loop run on quest 5 with all findings dispositioned; first retro recorded
- validation_summary: `node bin/quest list --json` → quests 1-11 complete (12 filed as follow-up); `examples/walkthrough.md` exists, hygiene-clean, real captures (in-session sonnet→haiku $0.346, codex 313k tokens, github backend leg verified via gh issue view); `quest protocol` → 5 amendments

Done-when enumeration: (1) remaining open quests worked via /quest:orchestrate with executors + checkpoints — Done (quests 3/5/6/7 parallel-dispatched with mid-flight protocol corrections; 10/11 orchestrated with rulings). (2) walkthrough.md on BOTH backends and BOTH workers, reproducible from README — Done. (3) reviewer dispatched before accepting a complete ruling, findings dispositioned — Done: quest 5 review verdict iterate; F1+F3 fixed via quest 11 (complete, live evidence); F2 claim corrected here: codex create_goal activation was NOT verified live — narration + corrective-resume was; the positive tool-call detection path is fixture-tested only, pending a codex build that emits it; F4: the unnamed substitution is hereby named (stated loop node --test tests/ does not run on Node 20/24 — canonical npm test used; codified as amendment 2); F5 → amendment 5. (4) retro with ≥1 evidence-cited amendment — Done (5 amendments). (5) sonnet orchestrator + haiku executor visible in walkthrough commands — Done (walkthrough §2).
