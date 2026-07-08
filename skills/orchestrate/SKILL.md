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
   quest list --ready --json   # the dispatch queue (deps met, priority order)
   quest runs --active         # headless runners that outlived prior sessions
   ```
2. **Dispatch** each ready quest per its record:
   - In Codex, prefer the native `quest-executor` custom agent for an
     interactive single quest; prompt = "Work quest <id> per $quest:work." If
     the agent is missing, run `quest codex install-agents --scope project` (or
     `$quest:setup`) before dispatching.
   - In Claude Code, spawn the `quest-executor` subagent with the record's
     `model`/`effort` as the dispatch override and the same prompt.
   - For headless Codex/Claude work, parallel batches, or anything long-running,
     run `quest-run <id>` in **background Bash** and keep working; you'll be
     notified when it exits. Parallel file-disjoint quests:
     `quest-run --ready --parallel 3` (add `--isolate worktree` when they touch
     the same files).
3. **Verify before you believe:** when a worker stops, run
   `quest show <id> --json`. A stop WITHOUT a new checkpoint is a protocol
   violation — redispatch with exactly that instruction. Never accept a chat
   summary in place of a recorded checkpoint.
4. **Review before accepting complete:** for non-trivial quests, spawn
   `quest-reviewer` on the diff + checkpoint evidence. Every finding gets a
   disposition: fixed / follow-up quest filed / rejected-with-reason.
5. **Rule** (quote evidence, never adjectives):
   - **accept** — the validation_summary's commands actually discharge the
     Done-when items.
   - **iterate-with-feedback** — send the specific gap back (continue the
     subagent, or `quest-run <id> --continue-session`).
   - **split** — bigger than it looked → `$quest:plan` to decompose; cancel or
     re-parent the original honestly.
   - **escalate-to-human** — surface human-only decisions verbatim. Never
     guess a ruling the human should make.
6. **Wave done?** When `quest list --ready` empties and nothing is in flight:
   run `$quest:retro` before starting the next wave.

## Closing an epic

An epic is an ordinary quest that other quests name as `parent`. It is **never
dispatched to a worker**: `quest list --ready` gates it out while any child is
non-terminal, and `quest-run --ready` refuses it even once every child is
terminal (a direct `quest-run <id>` on an epic still runs, but don't — it burns
a worker on pure verification). Close it inline yourself, spending zero worker
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
quests are `in_progress`, so they do **not** re-appear in `quest list --ready`.
Reopening a child of a **complete** parent epic is allowed (a stderr warning, not
a block); you then rule whether the epic's completion verdict is falsified and,
if so, reopen the epic too. `cancelled` is fully terminal — file a new quest.

## Autonomous waves

For an unattended wave, pin your own session to the outcome with a native goal:

```
every quest in this wave shows complete or blocked in `quest list --json` output
```

In Codex, use the native goal tool when available; in Claude Code, use
`/goal <condition>`. The harness then keeps you cycling until the wave is
genuinely done.

## Worked example

```bash
quest list --ready --json     # → [{"id":12,"worker":"claude"…},{"id":13,"worker":"codex"…}]
# 12 → dispatch quest-executor subagent (model/effort from the record)
# 13 → background Bash: quest-run 13
# …executor stops →
quest show 12 --json          # new checkpoint? quest_status? evidence?
# reviewer on 12's diff → findings dispositioned → accept
```

**Next:** contracts weak? `$quest:plan` to fix them first. Wave finished?
`$quest:retro`. Vocabulary and stop rules: `$quest:protocol`.
