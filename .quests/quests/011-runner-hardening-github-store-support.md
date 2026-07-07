---
id: 11
title: Runner hardening: github-store support and wall-clock session timeout
status: blocked
priority: p1
worker: claude
model: inherit
max_iterations: 8
created: 2026-07-07T14:28:21Z
updated: 2026-07-07T15:07:36Z
---

# Runner hardening: github-store support and wall-clock session timeout

## Objective
quest-run works against github-backed stores and bounds each worker session with a wall-clock timeout, closing reviewer findings F1 and F3 on quest 5.

## Done when
- [ ] the github-backend refusal in lib/runner.mjs is removed and a live quest reaches complete via quest-run against a github-backed store (scratch repo evidence)
- [ ] a per-session wall-clock timeout (--session-timeout, config default) kills a hung worker and counts the session as stalled; shim-tested with a hanging fake worker
- [ ] `npm test` green including new tests

## Validation loop
```bash
npm test
```

## Constraints
- runner keeps writing records only via the quest CLI; no new dependencies

## Context
Reviewer findings on quest 5 (F1: runner exits 6 on github backend though all its store IO already goes through the backend-agnostic quest CLI; F3: no timeout/kill anywhere in lib/runner.mjs or lib/workers.mjs — grep timeout|kill returns nothing). Scratch repo robertsreberski/quest-scratch-g3 exists for live evidence. Symbols: spawnCapture, runQuest in lib/runner.mjs

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-07T15:07:36Z — quest_status: blocked
- iteration: 1
- changed: F1 runner github-store support DONE (exit-6 guard removed; runner drives github end-to-end). F3 wall-clock session-timeout DONE (unit-tested). npm test 75 green. BLOCKED on ONE F1 evidence clause: a live quest reaching complete via an autonomous worker cannot be demonstrated on this machine (both headless workers non-functional).
- validation_summary: `npm test` -> 75 pass / 0 fail, incl. new "session timeout: a hung worker is killed, counts as a stall, 2 -> blocked, exit 10" (returns ~2.3s; both sessions journaled timed_out:true). `node bin/quest-run 3|5|6 --json --worker codex` vs github store robertsreberski/quest-scratch-g3 -> each RAN end-to-end (NO exit 6 anymore), reached terminal blocked (exit 10). `quest show 3 --json` -> status blocked, 1 checkpoint. `gh issue view 3 --repo robertsreberski/quest-scratch-g3 --json comments --jq .comments|length` -> 1 (runner stall-checkpoint landed as github issue comment; body: <!-- quest:checkpoint --> quest_status: blocked). `gh issue view 3 --json labels` -> quest:blocked (label transitioned in-progress->blocked). No-complete root cause: `codex mcp list` -> node_repl/figma/github only (NO create_goal goal-tool -> codex narrates it per amendment 3); `claude -p` -> "Not logged in" (no ANTHROPIC_API_KEY; clean env unchanged).
- failed_approaches: Live autonomous-worker complete: codex quests 3/5/6 all blocked via stall (796k/1.03M/2.12M tokens) - no create_goal tool so it narrates + never reaches `quest checkpoint` in budget; quest 6 (clean pluginRoot, no tests/shims) CREATED the working Makefile but still did not checkpoint. claude quest 4 blocked with 0 tokens (headless Not logged in).

Done-when enumeration:
[1] github refusal removed + live quest reaches complete via quest-run against github = PARTIAL.
  DONE: exit-6 refusal deleted from run() in lib/runner.mjs (grep github -> only backend-agnostic comment). quest-run now drives github: 4 live runs vs robertsreberski/quest-scratch-g3 each started the issue, read state via the backend-agnostic quest CLI per iteration, journaled to LOCAL runs.ndjson (correct per contract-spec), and authored a stall checkpoint that landed as a github ISSUE COMMENT (issue #3 comments=1, issue #5 comments=1) with the issue label transitioned to quest:blocked. Runner code drives github identically to local; complete-terminal path is unit-proven (happy-path shim -> exit 0) and uses the same seam.
  BLOCKED: a LIVE quest reaching complete could not be shown. Both headless workers are non-functional for autonomous goal-mode completion on THIS machine: codex has no create_goal goal-tool (codex mcp list = node_repl/figma/github) so it narrates create_goal and cannot reach `quest checkpoint` within budget; headless claude = Not logged in (no API key). This is a worker/environment limitation orthogonal to the github-store change (would block a LOCAL quest identically). Needs orchestrator ruling: accept the end-to-end github round-trip (terminal blocked-checkpoint-as-issue-comment) as satisfying quest-run github support, or re-run in an env with a working headless worker (authed claude, or codex with goal tools).
[2] per-session wall-clock timeout kills a hung worker + counts as stall; shim-tested = DONE. --session-timeout <s> flag + config defaults.session_timeout (default 1800s) resolved in resolveOptions; spawnCapture arms a timer that SIGKILLs the child and returns timedOut; runQuest loop tracks sessionTimedOut, journals iteration_finished with timed_out, and gates progress (progressed = newCheckpoint && !sessionTimedOut) so a timed-out session never counts as progress and never fabricates results. New unit test (hang shim) green. Also visible live: every iteration_finished event carries the timed_out field.
[3] npm test green incl new tests = DONE. `npm test` -> 75 pass / 0 fail.
Docs: bin/quest-run --help lists --session-timeout + notes github+timeout; README budgets/backends note updated, stale quest-3 "until it ships" note replaced. Per parent instruction NOT git-committed. skills/agents/hooks/.github untouched.
runs.ndjson decisive lines (amendment 5):
{"event":"iteration_finished","run_id":"csdbiarb","quest":3,"worker":"codex","tokens":303546,"timed_out":false,"status_after":"in_progress"}
{"event":"run_ended","run_id":"csdbiarb","quest":3,"worker":"codex","final_status":"blocked","iterations":2,"tokens":796389}
{"event":"run_ended","run_id":"xfjmglan","quest":4,"worker":"claude","final_status":"blocked","iterations":2,"tokens":0}
{"event":"run_ended","run_id":"18g9zq9m","quest":5,"worker":"codex","final_status":"blocked","iterations":2,"tokens":1026247}
{"event":"run_ended","run_id":"zx123csp","quest":6,"worker":"codex","final_status":"blocked","iterations":2,"tokens":2119558}
