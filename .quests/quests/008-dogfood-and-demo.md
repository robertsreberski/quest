---
id: 8
title: Dogfood the loop and capture the demo walkthrough
status: todo
priority: p0
worker: claude
model: inherit
max_iterations: 8
depends_on: [3, 4, 5, 6, 7]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T13:12:31Z
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

## Out of scope
- Release mechanics (quest 9).

## Checkpoints
