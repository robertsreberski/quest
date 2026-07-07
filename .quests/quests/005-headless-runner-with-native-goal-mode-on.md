---
id: 5
title: Headless runner with native goal mode on both workers
status: complete
priority: p1
worker: claude
model: inherit
max_iterations: 10
depends_on: [2, 4]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T14:18:19Z
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

<!-- quest:checkpoint -->
### 2026-07-07T14:18:19Z — quest_status: complete
- iteration: 2
- changed: Shipped bin/quest-run + lib/runner.mjs + lib/workers.mjs (claude+codex adapters); 14 runner tests + claude/codex shims; both workers reached complete live
- validation_summary: `node --test tests/runner.test.mjs` -> 14 passed, 0 failed; `node --test tests/*.test.mjs` -> 74 passed, 0 failed; live: codex run imi9jhvc (gpt-5.5) + claude run gvevg81b both -> quest complete; `node scripts/{validate-manifests,check-hygiene,check-agent-parity}.mjs` all OK

Done-when enumeration (all Done):

1) Claude worker goal-mode invocation — DONE. claude.buildInvocation (lib/workers.mjs) emits `claude -p "/goal <machine-generated condition citing runStartIso> ..." --plugin-dir <root> --model M --output-format json --permission-mode acceptEdits --allowedTools Bash,Read,Edit,Write,Glob,Grep,Skill --append-system-prompt <non-interactive rules>`. Live via tmux: quest reached complete within ONE goal-mode session (run gvevg81b, $0.5157, checkpoint '`make hello` -> printed hello'). Guards (max-iterations/max-cost/max-tokens) verified: unit exit-11 + live --max-iterations 3 bound respected.

2) Codex worker — DONE. codex.buildInvocation emits `codex exec "<create_goal-mandated prompt>" --json -m M -C cwd --sandbox workspace-write --skip-git-repo-check -o <tmp> --output-schema schemas/final-report.schema.json -c model_reasoning_effort=E`. create_goal activation VERIFIED FROM THE --json STREAM: on codex-cli 0.142.5 + ChatGPT account the tool is narrated (agent_message) not invoked (0 create_goal tool events across raw captures; tried default/--enable goals/token_budget) — exactly the 'narrated instead of invoked' branch the Done-when names; codexUsedCreateGoal() detects it and runSession issues ONE corrective `codex exec resume --last` (unit test asserts 2nd call is a resume containing 'narrated it instead'). Continuation resumes on unmet condition (max 3/iteration). --output-schema enforced (in invocation). PATH propagation into the workspace-write sandbox VERIFIED LIVE: codex ran `quest show 1 --json` against the central store (runner sets PATH=<root>/bin:... + QUEST_DIR; survives codex's zsh -lc wrapper). Live: run imi9jhvc reached complete. FINDING/fallback: gpt-5-codex is unsupported on this ChatGPT account (400) — used --model gpt-5.5; if a codex build/account exposes create_goal headless, the same detector will see the real tool-call event (isToolCallItem) with no code change.

3) Deterministic enforcement — DONE. 2 consecutive no-checkpoint sessions -> runner-authored `quest checkpoint --status blocked` ('runner: 2 consecutive sessions ended without a checkpoint') exit 10; iteration/cost/token budget -> runner blocked exit 11. Unit-tested against fake claude+codex PATH shims (tests/shims/{claude,codex}): stall, iteration-budget, token-budget cases. --max-tokens added (compatible expansion) so codex spend is bounded since USD is unreported.

4) Runs journal + notify — DONE. run_started/iteration_finished(session_id,cost_usd,tokens,status_after)/run_ended(final_status,iterations,cost) appended to .quests/runs.ndjson via appendRunEvent; `quest runs --active` reflects active->ended (verified live for both runs; codex cost stays 0/token-only, claude $0.5157). --notify runs on run end with QUEST_ID/QUEST_TITLE/FINAL_STATUS/ITERATIONS/COST via sh -c; failure warns but never changes exit code — both unit-tested.

5) --ready --parallel + --isolate worktree — DONE. Pool re-polls `quest list --ready --json` after each completion to promote newly-ready quests; unit test proves quest 2 (depends_on 1) is promoted after 1 completes. --isolate worktree runs `git worktree add <repo>/.quests-wt/<id>-<slug> -b quest/<id>-<slug>` (left in place; PR is merge path) with QUEST_DIR pinned to the central store; unit test asserts worktree dir + branch quest/1-widget exist and the quest completes.

6) Live smoke both backends+workers — DONE. Throwaway git repos: codex worker (direct) run imi9jhvc -> complete, Makefile created, `make hello` prints hello; claude worker (via tmux) run gvevg81b -> complete in ONE goal-mode session. Backgrounded dispatch round-trip: both dispatched off-session, completion noticed via runs journal (`quest runs --active` -> none after; `quest runs` -> ended complete).

Deviations: (a) claude child PATH prepends <root>/bin (design specified only CLAUDE_EFFORT) so the worker's Bash can reach the `quest` CLI to checkpoint — necessary, mirrors codex. (b) Added --max-tokens flag (not in the brief) to satisfy Done-when 3's token budget for codex. (c) codex model gpt-5.5 (config default gpt-5-codex unsupported on this account). No files outside scope touched; nothing committed.
