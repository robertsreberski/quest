---
id: 27
title: Align Quest skills with v2 operator workflow
status: todo
priority: p1
worker: codex
model: gpt-5.5
effort: medium
max_iterations: 3
parent: 21
depends_on: [22, 23, 24, 25, 26]
created: 2026-07-08T21:51:40Z
updated: 2026-07-08T21:51:40Z
---

# Align Quest skills with v2 operator workflow

## Objective
The bundled Quest skills describe the v2 operator workflow, including queue inspection and provider work handoffs, without relying on stale global Quest behavior.

## Done when
- [ ] `skills/orchestrate/SKILL.md` explains `quest list --queue --json` for orchestration state, `worker_ready` dispatch, and `inline_close_ready_epics` closure while preserving `quest list --ready` as the dispatch-only shortcut
- [ ] `skills/plan/SKILL.md` describes wave ordering with `quest list --queue` and worker-ready semantics after child creation
- [ ] skill guidance mentions using the checkout `quest` binary or verified PATH when local and installed versions can differ
- [ ] `npm test`, `npm run check:hygiene`, and `npm run check:manifests` pass

## Validation loop
```bash
npm test
npm run check:hygiene
npm run check:manifests
```

## Constraints
- do not change quest record format or CLI behavior in this quest
- keep skill text concise and operational, not a second README

## Milestones
- [ ] M1 — update plan/orchestrate skill wording for queue and PATH-aware workflow
- [ ] M2 — update tests or snapshots if instruction tests assert the old wording

## Context
Epic #21 audit found skills/orchestrate/SKILL.md and skills/plan/SKILL.md still treat quest list --ready as the whole queue after v2 introduced quest list --queue. Relevant tests: tests/instructions.test.mjs; docs/help already updated by quest 24.

## Out of scope
- new CLI features or README rewrites

## Checkpoints
