---
id: 14
title: Fix Codex plugin hook config schema
status: complete
priority: p2
worker: codex
model: gpt-5.5
effort: xhigh
max_iterations: 8
created: 2026-07-07T19:06:08Z
updated: 2026-07-07T19:07:04Z
---

# Fix Codex plugin hook config schema

## Objective
Quest's plugin hooks config is valid for Codex's strict hook parser while preserving the existing SessionStart and SubagentStop hook behavior.

## Done when
- [ ] hooks/hooks.json and the installed cache hooks.json have only the top-level `hooks` field accepted by Codex
- [ ] `codex debug prompt-input "noop"` completes without a plugin hooks parse warning
- [ ] `npm test` and `npm run check:manifests` pass

## Validation loop
```bash
npm test && npm run check:manifests && codex debug prompt-input "noop"
```

## Constraints
- Keep the hook command/event behavior unchanged apart from schema-valid metadata removal
- Do not change unrelated quest records or plugin manifests

## Milestones
- [ ] M1 — Confirm parser failure source and working schema
- [ ] M2 — Patch source and installed hook config
- [ ] M3 — Run test and Codex startup validation

## Context
Hook config: hooks/hooks.json; installed cache: ~/.codex/plugins/cache/quest/quest/0.1.0/hooks/hooks.json; prior hook parser lesson in Codex memory

## Out of scope
- Changing hook runtime logic, quest protocol behavior, or publishing a new plugin release

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-07T19:07:04Z — quest_status: complete
- iteration: 1
- changed: Removed the invalid top-level description from source and installed cache hook configs; added check:manifests coverage for the strict top-level hooks wrapper.
- validation_summary: `npm test && npm run check:manifests && codex debug prompt-input "noop"` → 80 tests passed; validate-manifests reported 3 manifests and hook config valid; Codex debug emitted no hook parse warning

Done-when enumeration: (1) hooks/hooks.json and installed cache hooks.json have only the top-level `hooks` field — Done, verified by JSON inspection and validate-manifests. (2) `codex debug prompt-input "noop"` completes without a plugin hooks parse warning — Done, stderr empty and no hook parse warning in captured output. (3) `npm test` and `npm run check:manifests` pass — Done, 80 tests passed and manifest/hook config validation reported OK.
