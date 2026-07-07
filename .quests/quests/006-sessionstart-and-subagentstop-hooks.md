---
id: 6
title: SessionStart and SubagentStop hooks
status: complete
priority: p1
worker: claude
model: inherit
max_iterations: 6
depends_on: [2, 4]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T14:01:25Z
---

# SessionStart and SubagentStop hooks

## Objective
Ship the two Claude Code hooks: a SessionStart summary of in-flight quests and
active runs, and a SubagentStop blocker that prevents quest-executor subagents
from stopping without recording a checkpoint.

## Done when
- [ ] SessionStart: when a `.quests/` store exists upward of cwd, injects a
      one-paragraph summary (in-flight/blocked quests + active runs); silent
      no-op otherwise (no store ≠ error).
- [ ] SubagentStop: detects quest-executor transcripts via the deterministic
      marker (a `quest show <id> --json` invocation), extracts the id, compares
      the latest checkpoint timestamp against subagent start; blocks with a
      corrective reason when no new checkpoint exists.
- [ ] Fixture tests: executor-with-checkpoint passes; executor-without blocks;
      unrelated subagent transcript untouched.
- [ ] Live verification: a deliberately checkpoint-skipping executor gets
      blocked and then complies.

## Validation loop
```bash
node --test tests/hooks.test.mjs
node --test tests/
```

## Constraints
- Strict marker scoping — zero false positives on non-quest subagents.
- Hooks read state via the `quest` CLI; they never write records.
- Hook scripts are fast (SessionStart adds no perceptible session latency).

## Context
Hook registration: `hooks/hooks.json` referencing `${CLAUDE_PLUGIN_ROOT}`.
Blocking contract: JSON `{"ok": false, "reason": …}` / exit 2, 8-block cap.

## Out of scope
- Codex-side stop enforcement (covered deterministically by the runner).

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-07T14:01:25Z — quest_status: complete
- iteration: 1
- changed: Shipped hooks/hooks.json (SessionStart startup|clear|compact + SubagentStop) plus session-start.mjs (in-flight quest summary) and subagent-stop.mjs (marker-scoped no-checkpoint blocker); 7 fixture-driven tests; live-verified both hooks
- validation_summary: `node --test tests/hooks.test.mjs` → 7 pass 0 fail; `npm test` (node --test "tests/*.test.mjs") → hooks all green (lone repo red is concurrent quest-3 store-github.test.mjs, not mine); `validate-manifests`/`check-agent-parity` OK; `check-hygiene` OK for my files (lone hit is quest-7's pre-existing record); LIVE SubagentStop blocked+comply-checkpointed, LIVE SessionStart injected on startup

Done-when enumeration:
1. DONE — SessionStart injects a one-paragraph summary when a .quests store exists upward of cwd; silent no-op otherwise. hooks/session-start.mjs; test (d) no-store→empty exit0, test (e) seeded store→counts+title+`quest list --ready`; live startup injected verbatim "Quest store (.quests): 1 quest — 1 in_progress. In flight: #1 Live hook probe [in_progress]. Active runs: 0. Ready to work next: `quest list --ready`."
2. DONE — SubagentStop detects the `quest show <id> --json` marker (first id), compares latest checkpoint vs subagent start (transcript first timestamp), and blocks with the corrective reason. hooks/subagent-stop.mjs; live block reason seen verbatim: "quest 1: record a checkpoint via `quest checkpoint 1` before stopping (protocol: no stop without a checkpoint)".
3. DONE — Fixture tests: (a) executor+fresh-checkpoint→allow, (b) executor without new checkpoint→block (exact reason asserted), (b`) stale checkpoint still blocks, (c) unrelated transcript→allow silent, plus unknown-quest→allow. tests/hooks.test.mjs = 7 pass 0 fail.
4. DONE — Live: a checkpoint-skipping executor was BLOCKED 20+ times (refused, per its no-checkpoint instruction); a cooperative executor was blocked then COMPLIED by running `quest checkpoint 1`, driving the quest record 0→1 checkpoint (visible: "live comply after hook block").

Deviations from the prompt/record vs current docs:
- BLOCK CONTRACT: record said {"ok":false} / exit 2. Per code.claude.com/docs/en/hooks TODAY, {"ok":false,"reason"} is the prompt/agent-hook shape; for a type:command SubagentStop hook the contract is {"decision":"block","reason"} (exit 0) OR exit 2+stderr. Used {"decision":"block","reason"} exit 0 — live-confirmed firing.
- SessionStart matcher: used three explicit single-value groups (startup, clear, compact) rather than one regex-alternation matcher, for cross-version robustness; live-confirmed on startup (resume intentionally excluded per record).
- Subagent start time: SubagentStop payload has agent_id/agent_type/effort but NO start-timestamp field; derived start from the transcript first `timestamp` (payload.start_time/started_at honored if a future version adds it).
- Block cap: docs cite an 8-consecutive-block cap for Stop; live SubagentStop fired 20+ times before the harness gave up (cap higher/counted differently). A compliant executor breaks the loop on its first checkpoint.
- hooks/hooks.json is auto-discovered at plugin root (docs confirmed); plugin.json untouched.

Concurrency note: repo has other executors live-editing lib/ (quests 3,5). Repo-wide `npm test` shows ONE unrelated red — tests/store-github.test.mjs:45 (quest 3 github backend, in-flight) — NOT this quest. My hooks depend only on stable findStoreDir/loadConfig/listQuests/readRuns/loadQuest.
