---
id: 21
title: Quest v2: efficient native loop engineering
status: todo
priority: p0
worker: codex
model: gpt-5.5
effort: xhigh
max_iterations: 1
created: 2026-07-08T21:20:02Z
updated: 2026-07-08T21:20:02Z
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
