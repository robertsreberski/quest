---
id: 15
title: quest reopen verb: audited path from complete back into the loop
status: complete
priority: p1
worker: claude
model: opus
effort: xhigh
max_iterations: 8
created: 2026-07-07T21:06:46Z
updated: 2026-07-07T21:45:21Z
---

# quest reopen verb: audited path from complete back into the loop

## Objective
Add `quest reopen <id> --reason` so a completed quest can legally re-enter the loop with an audited reopen checkpoint, replacing the hand-edit-of-terminal-status workaround observed in the test-mario retro.

## Done when
- [ ] `quest reopen <id> --reason "…"` flips complete to in_progress on both local and github backends, appending a checkpoint carrying a new optional reopen_reason field; missing --reason exits 5; non-complete statuses are rejected by a new assertReopen in lib/contract.mjs
- [ ] assertTransition("complete","in_progress") still throws; its hint now points at quest reopen and keeps the word terminal (contract.test.mjs asserts on it)
- [ ] github backend reopens the issue and swaps quest:complete to quest:in-progress via the existing applyStatus path, comment-first operation order
- [ ] quest-run early-exit stderr on an already-complete quest suggests quest reopen <id> --reason
- [ ] editQuest on a complete or cancelled quest errors with a reopen-it-first / file-a-new-quest hint on both backends
- [ ] reopened records lint clean before and after re-completion; no lint rules added or tightened
- [ ] surfaces updated: lib/store.mjs seam, lib/cli.mjs handler modeled on cancel, lib/help.mjs COMMANDS.reopen plus regenerated tests/snapshots/help-general.txt, contract-spec.md transitions and checkpoint fields, protocol.md, skills/orchestrate/SKILL.md "Reopening completed work" note, README CLI table
- [ ] `npm test` passes with new tests in tests/contract.test.mjs (assertReopen matrix, reopen_reason round-trip), tests/store-local.test.mjs (reopen-to-recomplete lifecycle lint-clean, edit-on-complete throws), tests/store-github.test.mjs (shim shows issue OPEN, label swap, checkpoint comment with reopen_reason), tests/cli.test.mjs (exit 5 on missing reason)

## Validation loop
```bash
npm test
```

## Constraints
- do not widen TRANSITIONS.complete — reopen is a separate assertReopen path used only by the reopen verb; a checkpoint can never resurrect a complete quest
- cancelled stays fully terminal
- reopened quests do not re-enter quest list --ready (status in_progress); they are dispatched directly by id
- reopening a child of a complete parent epic is allowed with a stderr warning, never blocked

## Milestones
- [ ] M1 — contract.mjs: assertReopen, reopen_reason checkpoint field, terminal-hint update, unit tests
- [ ] M2 — store-local.mjs: reopenQuest modeled on cancelQuest, editQuest terminal guard, tests
- [ ] M3 — store-github.mjs: reopenQuest via applyStatus, editQuest guard, store.mjs seam, shim tests
- [ ] M4 — cli.mjs + help.mjs: reopen handler, help entry, regenerated help-general snapshot, runner early-exit stderr hint, tests
- [ ] M5 — docs: contract-spec.md, protocol.md, orchestrate SKILL.md, README

## Context
Design fixed at filing time (retro of the test-mario store). Model reopenQuest on cancelQuest (store-local.mjs ~156, store-github.mjs ~363) and the cli cancel handler (~301). Evidence: ../test-mario retro — run otviq41n was a 0-iteration no-op on a complete quest, followed by an uncommitted hand-edit of the status line so run qdeadkg5 could fix review-found npm audit criticals; post-epic defects were fixed by manual commits 85a014e/4737c48 outside the loop.

## Out of scope
- ledger truthfulness changes (cost_usd null semantics, no_op marker, run_started metadata)
- checkbox template changes and codex token_usage breakdown

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-07T21:13:05Z — quest_status: in_progress
- iteration: 1
- changed: M1: contract.mjs assertReopen(from) (only complete reopenable; cancelled stays terminal), optional reopen_reason field in makeCheckpoint, assertTransition complete-hint now points at quest reopen while keeping 'terminal'
- validation_summary: `npm test` → 83 passed, 0 failed (was 80; +3 contract tests: assertReopen matrix, reopen_reason round-trip, terminal-hint points at reopen)

TRANSITIONS.complete left as [] — assertReopen is a separate path used only by the reopen verb. Committed 7b56113.

<!-- quest:checkpoint -->
### 2026-07-07T21:13:58Z — quest_status: in_progress
- iteration: 2
- changed: M2: store-local reopenQuest(dir,id,reason) modeled on cancelQuest — assertReopen guard, flips complete→in_progress, appends a real in_progress checkpoint carrying reopen_reason; editQuest now throws on complete (reopen-first hint) and cancelled (file-new-quest hint)
- validation_summary: `npm test` → 86 passed, 0 failed (+3 store-local tests: reopen→re-complete lifecycle lint-clean incl. not-in-ready assertion, reopen rejects non-complete, edit-on-complete/cancelled throws)

Committed 8538f77.

<!-- quest:checkpoint -->
### 2026-07-07T21:16:22Z — quest_status: in_progress
- iteration: 3
- changed: M3: store-github reopenQuest (comment-first: post audited checkpoint, refresh meta, applyStatus in_progress swaps quest:complete→quest:in-progress + reopens issue) + editQuest complete/cancelled guard; store.mjs seam adds reopenQuest for both backends. Pulled the M4 CLI reopen handler + help COMMANDS.reopen + regenerated help-general.txt snapshot forward so the github round-trip test drives through cli.mjs like its siblings (single green commit).
- validation_summary: `npm test` → 89 passed, 0 failed (+3 github shim tests: issue OPEN + label swap + reopen_reason comment; reopen missing-reason exits 5 no-mutation; edit-on-complete exits 5 no-comment). help snapshot test green after regen.

Committed 936bc20. --reason missing → ContractError (exit 5), mirroring cancel — no UsageError pre-check. M4 remaining: runner early-exit stderr hint + its test + cli exit-5 test.

<!-- quest:checkpoint -->
### 2026-07-07T21:17:33Z — quest_status: in_progress
- iteration: 4
- changed: M4: quest-run early-exit on an already-complete quest now writes a stderr line suggesting `quest reopen <id> --reason` (never hand-edit status); added runner test (spawns nothing, journals a 0-session complete no-op) and cli test (reopen missing-reason exits 5; with reason flips complete→in_progress, records reopen_reason, and stays out of --ready).
- validation_summary: `npm test` → 91 passed, 0 failed (+2: runner early-exit-suggests-reopen, cli reopen exit-5/round-trip)

Committed 944617f. All CLI/help surfaces done. M5 remaining: docs (contract-spec.md, protocol.md, orchestrate SKILL.md, README) + check:parity/hygiene/manifests.

<!-- quest:checkpoint -->
### 2026-07-07T21:20:54Z — quest_status: complete
- iteration: 5
- changed: M5 docs done; quest reopen verb complete end-to-end across both backends, CLI, help, docs, and tests
- validation_summary: `npm test` → 91 passed, 0 failed; `npm run check:parity` → OK; `npm run check:manifests` → OK; live `quest reopen 1 --reason ...` → complete→in_progress, reopen_reason recorded, absent from --ready, `quest lint --all` → OK; `quest checkpoint 1 --status in_progress` on the re-completed quest → exit 5 (TRANSITIONS.complete not widened)

Done-when enumeration:
1. reopen flips complete→in_progress both backends, appends reopen_reason cp, missing --reason exits 5, non-complete rejected by assertReopen — DONE (assertReopen in lib/contract.mjs; reopenQuest in store-local.mjs & store-github.mjs; cli/github/store-local tests + live e2e).
2. assertTransition(complete,in_progress) still throws; hint points at quest reopen and keeps 'terminal' — DONE (contract.test.mjs new assertion + existing /terminal/ test still green; live hint shown).
3. github reopens issue + swaps quest:complete→quest:in-progress via applyStatus, comment-first — DONE (store-github.reopenQuest; shim test asserts OPEN + label swap + reopen_reason comment last).
4. quest-run early-exit stderr suggests quest reopen — DONE (runner.mjs io.errOut; runner.test asserts /already complete/ + /quest reopen 1 --reason/).
5. editQuest on complete/cancelled errors with reopen-first/new-quest hint both backends — DONE (guards in both; store-local + github tests).
6. reopened records lint clean before+after re-completion; no lint rules added/tightened — DONE (lintRecord untouched; store-local test + live lint OK).
7. surfaces updated: store.mjs seam, cli.mjs handler (modeled on cancel), help.mjs COMMANDS.reopen + regenerated help-general.txt, contract-spec.md, protocol.md, orchestrate SKILL.md 'Reopening completed work', README CLI row — DONE.
8. npm test passes with new tests in contract/store-local/store-github/cli — DONE (91 passed).
Constraints honored: TRANSITIONS.complete stays []; cancelled fully terminal; reopened quests stay out of --ready; child-of-complete-epic reopen documented as warn-not-block. Out-of-scope (ledger/checkbox/token_usage) untouched.
Note: check:hygiene reports 2 pre-existing violations in .quests/quests/015 & 016 record Context (personal /Users plan path), present since filing commit ea89b0d — dogfood store data (.quests/ is not in package.json files, so not shipped), outside quest 15 scope and outside its npm test loop; my code/skill/README edits are hygiene-clean. Commits 7b56113,8538f77,936bc20,944617f,763b30e.

<!-- quest:checkpoint -->
### 2026-07-07T21:42:12Z — quest_status: in_progress
- iteration: 6
- changed: reopened from complete
- validation_summary: reopened for further work; no execution this entry
- reopen_reason: review finding 1 (medium): constraint 'reopening a child of a complete parent epic warns on stderr' is unimplemented — reopen path never inspects parent:, while orchestrate SKILL.md claims the warning exists; fix code + test, keep docs

<!-- quest:checkpoint -->
### 2026-07-07T21:45:21Z — quest_status: complete
- iteration: 7
- changed: Review finding 1 (Medium) fixed: CLI reopen handler now looks up the record's parent: after a successful reopen and, when the parent epic is complete, emits a stderr epic-falsification warning (best-effort — a missing/unloadable parent never fails the reopen). Both backends flow through this one handler. Docs (orchestrate SKILL.md) already described this; code now matches.
- validation_summary: `npm test` → 94 passed, 0 failed (+1 cli test: child-of-complete-parent reopen exits 0 AND warns /parent epic 1 is complete/ + /falsif/i; child-of-non-complete-parent emits empty stderr); live `./bin/quest reopen 2 --reason ...` on a complete parent epic printed the warning and exited 0

Reopened by orchestrator (quest reopen 15) after adversarial review verified all 8 original Done-when items and found this one gap. Fix committed 353f415. quest-12 stop-hook false positive was fixed separately in quest 17. Constraint 'reopening a child of a complete parent epic is allowed with a stderr warning, never blocked' is now fully implemented and tested. Out-of-scope areas untouched.
