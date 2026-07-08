---
id: 23
title: Add native provider recommendations and work handoffs
status: in_progress
priority: p0
worker: codex
model: gpt-5.5
effort: high
max_iterations: 5
parent: 21
depends_on: [22]
created: 2026-07-08T21:20:18Z
updated: 2026-07-08T21:38:19Z
---

# Add native provider recommendations and work handoffs

## Objective
Quest's provider commands tell operators the safest native path and can produce an exact provider-specific handoff for working one quest.

## Done when
- [ ] `quest codex doctor --json` includes a deterministic recommended path and command for native subagents, goal-required runner fallback, or goal-auto fallback based on live checks
- [ ] human doctor output prints the same recommendation concisely without hiding failed checks
- [ ] `quest codex work <id> --dry-run` and `quest claude work <id> --dry-run` run the provider health gate and print the exact handoff/prompt for that provider
- [ ] doctor-red scenarios do not launch or print a misleading work handoff
- [ ] `npm test` and `npm run check:parity` pass

## Validation loop
```bash
npm test
npm run check:parity
```

## Constraints
- provider work handoffs must use the checkout Quest command path in examples where possible
- do not bypass or soften the checkpoint-before-stop requirement

## Milestones
- [ ] M1 — add recommended_path data to doctor results and output
- [ ] M2 — add provider work dry-run command with tests

## Context
Loop findings: native provider loops 1 and 3. Files and symbols: runNativeSetupCommand and COMMANDS in lib/cli.mjs/lib/help.mjs; doctor and claudeDoctor in lib/codex-native.mjs; tests/cli.test.mjs; tests/shims/codex and tests/shims/claude.

## Out of scope
- launching real provider sessions from work handoff without an explicit non-dry-run design

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-08T21:34:20Z — quest_status: complete
- iteration: 1
- head_sha: f7c7164
- changed: M1/M2 done — doctor recommended_path output plus provider work dry-run handoffs
- validation_summary: `npm test` → 151 passed, 0 failed; `npm run check:parity` → parity: OK

Done — `quest codex doctor --json` includes deterministic recommended_path data for native subagents, goal-required runner fallback, and goal-auto fallback, covered by tests/cli.test.mjs. Done — human doctor output prints the same recommendation after all check lines, covered by tests/cli.test.mjs. Done — `quest codex work <id> --dry-run` and `quest claude work <id> --dry-run` run doctor --fix health gates and print provider-specific native handoff prompts or Codex runner fallback command, covered by tests/cli.test.mjs. Done — setup-red work dry-run refuses to print a handoff, covered by tests/cli.test.mjs stale PATH scenario. Done — `npm test` and `npm run check:parity` pass.

<!-- quest:checkpoint -->
### 2026-07-08T21:38:19Z — quest_status: in_progress
- iteration: 2
- changed: reopened from complete
- validation_summary: reopened for further work; no execution this entry
- reopen_reason: review found provider work --dry-run invokes doctor --fix and writes native agent files
