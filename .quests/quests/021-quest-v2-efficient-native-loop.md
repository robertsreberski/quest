---
id: 21
title: Quest v2: efficient native loop engineering
status: complete
priority: p0
worker: codex
model: gpt-5.5
effort: xhigh
max_iterations: 1
created: 2026-07-08T21:20:02Z
updated: 2026-07-08T21:56:23Z
---

# Quest v2: efficient native loop engineering

## Objective
Quest v2 makes the tool faster to operate, more concise at the command line, and more native in Codex and Claude while preserving checkpoint-based loop safety.

## Done when
- [ ] every non-cancelled child quest under this epic is complete with checkpoint evidence
- [ ] the v2 branch passes the full local gate: `npm test`, `npm run check:parity`, `npm run check:hygiene`, `npm run check:manifests`, and `./bin/quest lint --all`
- [ ] README, skills, and command help describe the final v2 operator workflow without relying on stale global `quest` behavior

## Validation loop
```bash
npm test
npm run check:parity
npm run check:hygiene
npm run check:manifests
./bin/quest lint --all
```

## Constraints
- use ./bin/quest or prepend this checkout's bin directory when verifying Quest behavior; the global PATH currently resolves an older installed quest
- preserve the existing record format unless a child quest explicitly owns a migration

## Milestones
- [ ] M1 — children complete and reviewed
- [ ] M2 — integration gate runs from the v2 branch

## Context
20-loop brainstorming covered CLI/help UX, runner/workers, native provider setup, hooks, and store/readiness; core files: lib/help.mjs, lib/cli.mjs, lib/runner.mjs, lib/workers.mjs, lib/codex-native.mjs, hooks/, agents/, tests/

## Out of scope
- publishing npm or marketplace releases

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-08T21:56:23Z — quest_status: complete
- iteration: 1
- changed: epic closed inline — children #22 #23 #24 #25 #26 #27 verified and integration loop green
- validation_summary: `npm test` → 158 passed, 0 failed; `npm run check:parity` → parity: OK; `npm run check:hygiene` → hygiene: OK; `npm run check:manifests` → validate-manifests: OK (3 manifests and hook config valid); `./bin/quest lint --all` → lint: OK (27 records)

Done: every non-cancelled child under epic #21 is complete with checkpoint evidence: #22 accepted (runner controls/resume routing), #23 accepted after dry-run repair, #24 accepted (concise output/docs), #25 accepted after silent-allow repair, #26 accepted (queue/graph lint), #27 accepted (skill workflow alignment). Done: full v2 local gate passed on branch v2 with npm test, check:parity, check:hygiene, check:manifests, and ./bin/quest lint --all. Done: README, command help, and Quest skills now describe the v2 workflow, including queue semantics, provider work handoffs, and checkout/PATH-aware verification. Out of scope respected: no publish/release performed.
