---
id: 5
title: Headless runner with native goal mode on both workers
status: todo
priority: p1
worker: claude
model: inherit
max_iterations: 10
depends_on: [2, 4]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T13:12:31Z
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
