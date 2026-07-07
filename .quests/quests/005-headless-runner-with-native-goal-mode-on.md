---
id: 5
title: Headless runner with native goal mode on both workers
status: in_progress
priority: p1
worker: claude
model: inherit
max_iterations: 10
depends_on: [2, 4]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T13:59:51Z
---

# Headless runner with native goal mode on both workers

## Objective
Ship `bin/quest-run` (`lib/runner.mjs`, `lib/workers.mjs`): a thin loop that
drives Claude (`claude -p` with `/goal`) and Codex (`codex exec` with thread
goal tools) workers in native goal mode, with deterministic budgets, stall
enforcement, a runs journal, notifications, and parallel execution.

## Done when
- [ ] Claude worker: goal-mode invocation with a machine-generated,
      conversation-verifiable condition; turn/wall-clock guards verified live.
- [ ] Codex worker: prompt-mandated `create_goal` activation verified from the
      `--json` event stream, one corrective `codex exec resume` if narrated
      instead of invoked; continuation resumes on unmet condition;
      `--output-schema schemas/final-report.schema.json` enforced; PATH
      propagation into the sandbox verified live (fallback documented).
- [ ] Deterministic enforcement: 2 consecutive sessions without a new
      checkpoint → runner-authored `blocked` checkpoint, exit 10; iteration/
      cost/token budget exhaustion → same, exit 11. Unit-tested against fake
      `claude` and fake `codex` PATH shims.
- [ ] Runs journal (`.quests/runs.ndjson`) + `quest runs --active`;
      `--notify '<cmd>'` template with env vars, notify failure isolated.
- [ ] `--ready --parallel N` promotes newly-ready quests; `--isolate worktree`
      gives each quest a worktree + `quest/<id>-<slug>` branch.
- [ ] Live smoke in a throwaway repo: synthetic quest reaches `complete` on
      both backends AND both workers; claude path completes within ONE
      goal-mode session; one orchestrated background dispatch round-trip
      (dispatch backgrounded, completion noticed, ruling recorded).

## Validation loop
```bash
node --test tests/runner.test.mjs
node --test tests/
```

## Constraints
- The runner never writes quest records directly — all state via the `quest` CLI.
- Fresh session per runner iteration by default; `--continue-session` opt-in.
- Never fabricate USD costs; token caps govern when USD is unreported.
- No dependency on experimental agent-teams features.

## Context
Worker invocation shapes + goal-condition text: the plan section "Headless
runner" mirrored in `skills/orchestrate` references. Final-report schema:
`schemas/final-report.schema.json`.

## Out of scope
- Additional worker types beyond claude/codex.

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-07T13:59:51Z — quest_status: in_progress
- iteration: 1
- changed: bin/quest-run + lib/runner.mjs + lib/workers.mjs (both adapters) + tests/runner.test.mjs + tests/shims/{claude,codex} implemented
- validation_summary: `node --test tests/runner.test.mjs` → 10 passed, 0 failed; `node --test tests/*.test.mjs` → 70 passed, 0 failed

Runner+adapters+unit tests green locally. Iteration boundary before live smokes (codex direct, claude via tmux). Note: repo hygiene gate currently trips on another executor's committed record 007-oss-hygiene-and-ci.md (parallel work in this shared tree) — not in quest 5's validation loop and not from my files.
