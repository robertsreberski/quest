---
name: orchestrate
description: Run the quest loop as orchestrator — dispatch workers on ready quests, verify checkpoints, rule on results, manage waves. Use when asked to orchestrate quests, run an epic, or drive multiple quests to completion.
argument-hint: "[epic-id]"
---

# Orchestrate quests

**What this does:** drives quests through workers and rules on the evidence —
you are the loop engineer, not the implementer.
**Use when:** more than one quest is in play, or a quest is dispatched rather
than worked inline.
**Input:** optionally an epic id to scope to; otherwise the whole store.
**What you get:** quests moved to complete/blocked with verified checkpoint
trails, and escalations only where a human ruling is genuinely needed.

## The cycle

1. **Adopt state** (especially at session start):
   ```bash
   quest list --queue --json   # orchestration state: worker_ready + inline_close_ready_epics
   quest runs --active         # headless runners that outlived prior sessions
   ```
   `worker_ready` is the worker dispatch queue (deps met, priority order);
   `inline_close_ready_epics` is the set of epics you close yourself after
   verifying children and the epic validation loop. `quest list --ready --json`
   remains a dispatch-only shortcut for `worker_ready`.
   When the checkout, plugin cache, and installed package may differ, run the
   checkout binary (`./bin/quest`) or verify `PATH` with `quest --version`
   before trusting queue or dispatch behavior.
   For an implementation accepted from `$quest:plan` in Codex Plan Mode, stay in
   this orchestrator role. Do not implement product code inline; create/lint the
   quest records if needed, then dispatch workers.
2. **Pin the wave with native goal mode:**
   - In Codex, call `create_goal` with this stopping condition:
     "every quest in the scoped wave shows complete, blocked, or cancelled in
     `quest list --json` output"; verify it with `get_goal`.
   - In Claude Code, start the turn with `/goal` using the same condition.
   If native goal mode is unavailable, say so and keep the Quest checkpoint
   trail as the hard stop signal; do not pretend a goal was set.
3. **Dispatch** each `worker_ready` quest per its record:
   - In Codex, the default path is native subagents for both serial and
     parallel waves. If `spawn_agent` is not visible, call `tool_search` once
     for subagent tools before choosing any fallback. When available, spawn:
     `agent_type: "quest-executor"` and prompt =
     `First call create_goal with: quest <id> has a new checkpoint whose
     quest_status is complete or blocked in \`quest show <id> --json\`; verify
     with get_goal; work quest <id> per $quest:work; only call
     update_goal(status="complete") after the checkpoint exists.`
     If the agent template is missing, run `quest codex install-agents --scope
     project` (or `$quest:setup`) before dispatching.
   - In Claude Code, spawn the `quest-executor` subagent with the record's
     `model`/`effort` as the dispatch override and prompt =
     `/goal quest <id> has a new checkpoint whose quest_status is complete or
     blocked in \`quest show <id> --json\`\nWork quest <id> per $quest:work.`
   - Use `quest-run` only when native subagents are still unavailable after
     `tool_search`, or when the user explicitly asks for headless/background
     execution. Codex fallback must require goal mode:
     `quest-run <id> --worker codex --codex-goal-mode require`. Headless
     file-disjoint waves can use `quest-run --ready --parallel 3
     --codex-goal-mode require` (add `--isolate worktree` when they touch the
     same files). Claude headless runs already enter native `/goal` mode.
4. **Verify before you believe:** when a worker stops, run
   `quest show <id> --json`. A stop WITHOUT a new checkpoint is a protocol
   violation — redispatch with exactly that instruction. Never accept a chat
   summary in place of a recorded checkpoint.
5. **Review before accepting complete:** for non-trivial quests, spawn
   `quest-reviewer` on the diff + checkpoint evidence in the same harness. Give
   it a goal: return an `accept` or `iterate` verdict with evidence. In Codex,
   ask it to call `create_goal`/`get_goal` and only `update_goal` after the
   verdict exists; in Claude Code, prefix the reviewer prompt with `/goal`.
   Every finding gets a disposition: fixed / follow-up quest filed /
   rejected-with-reason.
6. **Rule** (quote evidence, never adjectives):
   - **accept** — the validation_summary's commands actually discharge the
     Done-when items.
   - **iterate-with-feedback** — send the specific gap back (continue the
     subagent, or `quest-run <id> --continue-session`).
   - **split** — bigger than it looked → `$quest:plan` to decompose; cancel or
     re-parent the original honestly.
   - **escalate-to-human** — surface human-only decisions verbatim. Never
     guess a ruling the human should make.
7. **Wave done?** When `quest list --queue --json` shows no `worker_ready` or
   `inline_close_ready_epics`, and nothing is in flight, run `$quest:retro`
   before starting the next wave.

## Closing an epic

An epic is an ordinary quest that other quests name as `parent`. It is **never
dispatched to a worker**: it does not belong in `worker_ready`, and
`quest-run --ready` refuses it even once every child is terminal (a direct
`quest-run <id>` on an epic still runs, but don't — it burns a worker on pure
verification). Once it is closeable, `quest list --queue --json` reports it in
`inline_close_ready_epics`; close it inline yourself, spending zero worker
tokens:

1. **Verify the children are genuinely done:**
   ```bash
   quest list --parent <id> --json   # is every child complete or cancelled?
   ```
   A `cancelled` child is terminal too — account for why it was dropped; it does
   not block the epic and you do not wait on it.
2. **Run the epic's own validation loop** (the integration-level check in its
   record) and read each child's completion evidence — this is the real work of
   closing an epic.
3. **Record the verdict on the epic itself:**
   ```bash
   quest start <id>
   quest checkpoint <id> --status complete \
     --summary "epic closed inline — children #a #b #c verified, integration loop green" \
     --validation "<epic validation loop> → <observed result>"
   ```
   The checkpoint must **enumerate each child and each epic Done-when item** with
   its evidence — the same bar every quest meets, just discharged by you inline
   rather than by a dispatched worker.

## Reopening completed work

When review (or reality) finds a defect in a quest you already marked
**complete**, never hand-edit the status line and never redispatch a worker onto
the terminal record — `quest-run` early-exits on a complete quest and journals a
0-session no-op. Instead reopen it:

```bash
quest reopen <id> --reason "review found npm audit criticals after completion"
```

This flips `complete → in_progress` and appends an audited checkpoint carrying
`reopen_reason`, so the loop keeps custody of the defect trail. Then dispatch the
quest directly by id (`quest-run <id>` or a `quest-executor` subagent) — reopened
quests are `in_progress`, so they do **not** re-appear in `worker_ready` or
`quest list --ready`.
Reopening a child of a **complete** parent epic is allowed (a stderr warning, not
a block); you then rule whether the epic's completion verdict is falsified and,
if so, reopen the epic too. `cancelled` is fully terminal — file a new quest.

## Autonomous waves

For an unattended wave, pin your own session to the outcome with a native goal:

```
every quest in this wave shows complete, blocked, or cancelled in `quest list --json` output
```

In Codex, use the native goal tool when available; in Claude Code, use
`/goal <condition>`. The harness then keeps you cycling until the wave is
genuinely done.

## Worked example

```bash
quest list --queue --json     # → {"worker_ready":[{"id":12…},{"id":13…}],"inline_close_ready_epics":[]}
# 12 → spawn quest-executor with a child /goal or create_goal prompt
# 13 → spawn quest-executor too; use quest-run only if native subagents are unavailable
# …executor stops →
quest show 12 --json          # new checkpoint? quest_status? evidence?
# reviewer on 12's diff → findings dispositioned → accept
```

**Next:** contracts weak? `$quest:plan` to fix them first. Wave finished?
`$quest:retro`. Vocabulary and stop rules: `$quest:protocol`.
