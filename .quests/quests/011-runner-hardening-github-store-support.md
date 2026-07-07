---
id: 11
title: Runner hardening: github-store support and wall-clock session timeout
status: complete
priority: p1
worker: claude
model: inherit
max_iterations: 8
created: 2026-07-07T14:28:21Z
updated: 2026-07-07T15:11:01Z
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

<!-- quest:checkpoint -->
### 2026-07-07T15:10:55Z — quest_status: in_progress
- iteration: 2
- changed: orchestrator ruling on the blocker: environment limitation, not code — reran the live leg with the claude worker via tmux (user security session, where claude auth works; the executor was not given this machine quirk)
- validation_summary: ruling recorded; rerun evidence in the next checkpoint

<!-- quest:checkpoint -->
### 2026-07-07T15:11:01Z — quest_status: complete
- iteration: 3
- head_sha: b4fac1f
- changed: live github-store completion captured: quest-run drove a claude/haiku worker against a github-backed store (scratch repo) to complete
- validation_summary: `quest-run 7 --json` → {"final_status":"complete","iterations":1,"cost_usd":0.098,"tokens":2202,"exit_code":0} (runs journal line); `quest show 7 --json` → status complete, 1 checkpoint; `make hello` → hello; `gh issue view 7` → state CLOSED, stateReason COMPLETED, labels [quest, quest:complete, quest-p2]

Done-when enumeration: (1) github refusal removed + live complete via quest-run against a github-backed store — Done (evidence above; executor had already proven the round-trip with blocked-checkpoint-as-issue-comment, the complete leg needed the tmux auth route). (2) --session-timeout kills hung workers, counts toward stall, 2 hung sessions → blocked exit 10 — Done (hanging-shim unit test, runner returns ~2.3s). (3) npm test green — Done (
> quest-plugin@0.1.0 test
> node --test tests/*.test.mjs

✔ bare quest without a store guides to init (snapshot) (1.859667ms)
✔ help snapshots: general, create, checkpoint (1.319167ms)
✔ unknown command exits 2 with a hint (0.341291ms)
✔ commands without a store exit 3 with init hint (0.538834ms)
✔ full lifecycle through the CLI, with --json shapes (5.691458ms)
✔ bare quest with a store shows the overview (1.154959ms)
✔ unknown quest id exits 4 (0.685ms)
✔ illegal transition exits 5 with precise message (1.032ms)
✔ checkpoint without required flags exits 2 (1.141417ms)
✔ create without done-when exits 2 (0.536167ms)
✔ github backend surfaces gh unavailability as exit 6 (never falls back to local) (1.242166ms)
✔ init --agents-md appends orientation section (0.541917ms)
✔ edit requires rationale and records expansion (1.465791ms)
✔ amend numbers amendments and protocol prints them (1.046042ms)
✔ runs reports empty then aggregates events (0.84075ms)
✔ slugify truncates at word boundaries (0.895541ms)
✔ recordFilename pads id (0.08675ms)
✔ record round-trips through serialize/parse (0.622125ms)
✔ lint passes a canonical record (0.240375ms)
✔ lint catches missing sections, bad enums, unknown keys (0.086583ms)
✔ lint enforces section order (0.076875ms)
✔ makeCheckpoint requires fields and enum (0.244666ms)
✔ complete checkpoint demands backticked commands (0.102833ms)
✔ multi-line checkpoint fields are rejected (0.066584ms)
✔ checkpoints round-trip through parseCheckpoints (0.186708ms)
✔ status transitions enforce the lifecycle (0.116041ms)
✔ lint flags complete status without a complete checkpoint (0.084917ms)
✔ round-trips scalars and inline lists (0.852708ms)
✔ numbers parse as numbers, strings stay strings (0.073041ms)
✔ rejects nested yaml with a precise error (0.172291ms)
✔ rejects duplicate keys (0.404292ms)
✔ rejects valueless keys (0.064583ms)
✔ rejects unterminated fence (0.055792ms)
✔ rejects missing fence (0.057958ms)
✔ empty list round-trips (0.062333ms)
✔ SubagentStop: executor with a fresh checkpoint is allowed to stop (37.331458ms)
✔ SubagentStop: executor without a new checkpoint is blocked (31.42925ms)
✔ SubagentStop: a stale checkpoint (older than start) still blocks (30.919458ms)
✔ SubagentStop: an unrelated subagent is allowed silently (30.079166ms)
✔ SubagentStop: marker for an unknown quest allows (no false block) (28.688959ms)
✔ SessionStart: no store is a silent no-op (30.400375ms)
✔ SessionStart: seeded store injects counts and the in-flight quest (30.457166ms)
✔ happy path: shim records complete → exit 0 + full journal (242.886375ms)
✔ stall: 2 sessions without a checkpoint → runner-recorded blocked, exit 10 (280.310042ms)
✔ session timeout: a hung worker is killed, counts as a stall, 2 → blocked, exit 10 (2273.323541ms)
✔ iteration budget: exceeding --max-iterations → blocked, exit 11 (210.883416ms)
✔ token budget: exceeding --max-tokens → blocked, exit 11 (governs codex-style spend) (206.90225ms)
✔ notify runs with env vars on run end (asserted via a written file) (210.108625ms)
✔ notify failure is isolated — warns but never changes the exit code (212.95275ms)
✔ codex: narrated create_goal triggers exactly one corrective resume (265.840959ms)
✔ --dry-run prints the invocation and spawns nothing (31.528125ms)
✔ --dry-run --json emits the invocation as JSON (30.933542ms)
✔ in_progress checkpoint resets the stall counter (progress keeps iterating) (408.886834ms)
✔ resolution: --worker flag overrides the record frontmatter (31.430375ms)
✔ --ready runs every ready quest to completion (510.640334ms)
✔ --ready --parallel promotes a quest whose dependency just completed (506.480709ms)
✔ --isolate worktree gives the quest a git worktree + quest/<id>-<slug> branch (391.57775ms)
github.com
  ✓ Logged in to github.com account shim-user
github.com
  ✓ Logged in to github.com account shim-user
github.com
  ✓ Logged in to github.com account shim-user
github.com
  ✓ Logged in to github.com account shim-user
github.com
  ✓ Logged in to github.com account shim-user
github.com
  ✓ Logged in to github.com account shim-user
You are not logged into any GitHub hosts. Run `gh auth login` to authenticate.
✔ init --backend github requires auth, creates labels, writes local github config (303.971ms)
✔ github show --json is byte-identical in shape to the equivalent local record (346.972917ms)
✔ github lifecycle: start → checkpoint → complete, with identical checkpoint comment bytes (797.718541ms)
✔ illegal transition (todo → complete) exits 5 and mutates nothing (349.358667ms)
✔ child quest links into the parent's ## Children task list (368.669875ms)
✔ missing gh exits 6 and never falls back to local (256.6425ms)
✔ gh auth failure exits 6 with gh's stderr surfaced (28.049917ms)
✔ create assigns sequential ids and canonical filenames (4.088709ms)
✔ full lifecycle: create → start → checkpoint → complete (3.087375ms)
✔ checkpoint on a todo quest may move it to in_progress but not complete (2.130209ms)
✔ blocked → in_progress recovery works; complete is terminal (2.217ms)
✔ ready gating respects depends_on and priority order (9.018875ms)
✔ create rejects unknown depends_on and parent (0.997084ms)
✔ cancel records reason and is terminal (1.2135ms)
✔ edit appends only additions and records rationale (1.880584ms)
✔ malformed hand-edit fails lint with a precise error (0.970625ms)
✔ amendments number sequentially (0.628458ms)
✔ run events accumulate and parse (0.586541ms)
ℹ tests 75
ℹ suites 0
ℹ pass 75
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5858.513208 → 75 pass, 0 fail at b4fac1f).
