---
id: 19
title: Fix Codex doctor goal readiness and cancelled wave goals
status: complete
priority: p2
worker: codex
model: inherit
max_iterations: 3
created: 2026-07-08T12:05:25Z
updated: 2026-07-08T12:07:50Z
---

# Fix Codex doctor goal readiness and cancelled wave goals

## Objective
Address the two PR review findings by making Codex doctor fail when goal tools are disabled and by treating cancelled quests as terminal in orchestrator wave goals.

## Done when
- [ ] quest codex doctor reports a failing goals-feature check and exits non-zero when codex features list has goals=false even if multi_agent=true
- [ ] skills/orchestrate/SKILL.md wave-level native goal text treats complete, blocked, and cancelled store statuses as terminal while per-quest checkpoint goals still use complete or blocked quest_status
- [ ] `npm test && npm run check:parity && npm run check:hygiene && npm run check:manifests` passes with focused regressions for both review findings

## Validation loop
```bash
npm test && npm run check:parity && npm run check:hygiene && npm run check:manifests
```

## Constraints
- Preserve checkpoint vocabulary: quest_status remains in_progress|complete|blocked; only store-status wave conditions may mention cancelled
- Keep doctor output backward compatible except for adding the goals-feature check

## Milestones
- [ ] M1 — M1 — add goals-feature doctor readiness check plus shim and CLI regression coverage
- [ ] M2 — M2 — update orchestrator wave goal wording plus instruction regression coverage

## Context
Wave goal wording: skills/orchestrate/SKILL.md; protocol status vocabulary in skills/protocol/references/protocol.md

## Out of scope
- Changing quest checkpoint schema or allowing cancelled as a checkpoint quest_status
- Broader Codex plugin install, marketplace, or release-flow changes

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-08T12:07:50Z — quest_status: complete
- iteration: 1
- changed: review findings fixed — goals-feature doctor gate added and wave goals treat cancelled as terminal
- validation_summary: `npm test && npm run check:parity && npm run check:hygiene && npm run check:manifests` → npm test 117 passed, 0 failed; parity: OK; hygiene: OK; validate-manifests: OK

Done-when 1: Done — tests/cli.test.mjs covers QUEST_SHIM_GOALS=false with multi_agent true; doctor exits 1 and goals-feature.ok is false. Done-when 2: Done — skills/orchestrate/SKILL.md wave goals now say complete, blocked, or cancelled in quest list --json output; tests/instructions.test.mjs asserts quest_status goals do not mention cancelled. Done-when 3: Done — full validation loop passed exactly as written. Commit note: no commit created because the worktree contained pre-existing dirty PR changes before quest 19, and committing a subset would not represent the validated tree.
