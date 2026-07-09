---
id: 22
title: Harden runner loop controls and Codex resume routing
status: complete
priority: p0
worker: codex
model: gpt-5.5
effort: high
max_iterations: 5
parent: 21
created: 2026-07-08T21:20:10Z
updated: 2026-07-08T21:24:06Z
---

# Harden runner loop controls and Codex resume routing

## Objective
The headless runner rejects malformed numeric controls before spawning workers and routes Codex resumes to the correct session when a session id is known.

## Done when
- [ ] invalid numeric values for `--parallel`, `--max-iterations`, `--max-cost`, `--max-tokens`, and `--session-timeout` exit 2 before any worker is spawned
- [ ] Codex corrective and continuation resumes use the parsed session id when available, with `--last` only as the documented fallback when no id exists
- [ ] runner tests cover the numeric validation and Codex resume routing cases
- [ ] `npm test` passes

## Validation loop
```bash
npm test
```

## Constraints
- do not weaken existing stall, timeout, budget, or goal-mode enforcement
- do not fabricate Codex USD cost; token-only accounting remains unchanged

## Milestones
- [ ] M1 — add shared numeric flag parsing/validation with tests
- [ ] M2 — make Codex resume routing prefer parsed session ids with tests

## Context
Loop findings: runner brainstorming loops 1 and 4. Files and symbols: runReady and resolveOptions in lib/runner.mjs; codex.runSession, buildResume, and codexSessionId in lib/workers.mjs; tests/runner.test.mjs; tests/shims/codex.

## Out of scope
- adding a full review-runner mode

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-08T21:24:06Z — quest_status: complete
- iteration: 1
- changed: Hardened runner numeric controls and Codex resume routing
- validation_summary: `npm test` → 143 pass, 0 fail

Done-when evidence: invalid numeric values for --parallel, --max-iterations, --max-cost, --max-tokens, and --session-timeout exit 2 before any worker is spawned — Done: parseNumericFlag rejects invalid controls before run journaling/spawn; runner tests assert quest remains todo and no shim call logs/runs.ndjson exist. Codex corrective and continuation resumes use the parsed session id when available, with --last only as fallback — Done: codex.runSession passes sessionId || --last for corrective resumes and continuation tests assert parsed ids; fallback test omits thread id and asserts --last. Runner tests cover numeric validation and Codex resume routing cases — Done: tests/runner.test.mjs includes numeric control rejection, --parallel rejection, corrective routing, continuation routing, and fallback assertions. npm test passes — Done: npm test reported 143 pass, 0 fail.
