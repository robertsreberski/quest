---
id: 20
title: Add provider-parity setup repair and open commands
status: complete
priority: p2
worker: codex
model: gpt-5.5
effort: medium
max_iterations: 5
created: 2026-07-08T19:47:55Z
updated: 2026-07-08T19:55:47Z
---

# Add provider-parity setup repair and open commands

## Objective
Quest exposes matching Codex and Claude setup repair flows plus healthy open commands, so either provider can be initialized, repaired, verified, and launched through the same Quest UX.

## Done when
- [ ] `quest codex doctor --fix` and `quest claude doctor --fix` repair missing/stale Quest agent templates by default, repair provider plugin install/version state where the provider CLI supports it, rerun doctor, and exit 0 only when checks are green
- [ ] `quest codex open -- <args>` and `quest claude open -- <args>` run their provider health gate first, launch the interactive provider only when healthy, and pass through user args
- [ ] Provider differences are limited to real CLI differences: Codex launches with `codex -C <project-root>`; Claude launches from `<project-root>` as its cwd
- [ ] `quest init` continues to install both provider agent templates by default and its next steps mention both repair/open flows
- [ ] `npm test`, `npm run check:parity`, `npm run check:hygiene`, `npm run check:manifests`, `npm pack --dry-run`, and `git diff --check` pass

## Validation loop
```bash
npm test && npm run check:parity && npm run check:hygiene && npm run check:manifests && npm pack --dry-run && git diff --check
```

## Constraints
- Codex and Claude command behavior must stay parallel unless the provider CLI requires a concrete difference
- stale Quest agent templates are safe to overwrite by default for both providers
- doctor behavior without --fix remains backward-compatible

## Milestones
- [ ] M1 — generalized provider repair planner/applicator covers agents, plugin state, rerun, and command-report-only blockers
- [ ] M2 — open commands launch the correct provider with inherited stdio only after health passes
- [ ] M3 — help, README, changelog, shims, and tests cover both providers equally

## Context
CLI dispatch: lib/cli.mjs; provider setup: lib/codex-native.mjs; help/docs/tests: lib/help.mjs, README.md, tests/cli.test.mjs, tests/shims/codex, tests/shims/claude

## Out of scope
- editing global Codex/Claude config files or installing global npm packages

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-08T19:55:36Z — quest_status: complete
- iteration: 1
- changed: Implemented provider-parity doctor --fix and open commands; stale Quest templates now replace without force; docs and tests updated.
- validation_summary: `npm test && npm run check:parity && npm run check:hygiene && npm run check:manifests && npm pack --dry-run && git diff --check` → 139 tests passed; parity OK; hygiene OK; manifests OK; npm pack dry run OK; diff check OK

<!-- quest:checkpoint -->
### 2026-07-08T19:55:47Z — quest_status: in_progress
- iteration: 2
- changed: reopened from complete
- validation_summary: reopened for further work; no execution this entry
- reopen_reason: final checkpoint needed explicit Done-when evidence enumeration

<!-- quest:checkpoint -->
### 2026-07-08T19:55:47Z — quest_status: complete
- iteration: 3
- changed: Done-when 1: doctor --fix repairs agents/plugins and reruns green; Done-when 2: open gates launch and blocks red health; Done-when 3: Codex uses -C while Claude uses cwd; Done-when 4: init next steps/docs updated; Done-when 5: full validation gate passed.
- validation_summary: `npm test && npm run check:parity && npm run check:hygiene && npm run check:manifests && npm pack --dry-run && git diff --check` → 139 tests passed; parity OK; hygiene OK; manifests OK; npm pack dry run OK; diff check OK
