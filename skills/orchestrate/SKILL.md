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
   - `worker: claude` → spawn the `quest-executor` subagent with the record's
     `model`/`effort` as the dispatch override; prompt = "Work quest <id> per
     /quest:work."
   - `worker: codex`, parallel batches, or anything long-running → run
     `quest-run <id>` in **background Bash** and keep working; you'll be
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
   - **split** — bigger than it looked → `/quest:plan` to decompose; cancel or
     re-parent the original honestly.
   - **escalate-to-human** — surface human-only decisions verbatim. Never
     guess a ruling the human should make.
6. **Wave done?** When `quest list --ready` empties and nothing is in flight:
   run `/quest:retro` before starting the next wave.

## Autonomous waves

For an unattended wave, pin your own session to the outcome with a native goal:

```
/goal every quest in this wave shows complete or blocked in `quest list --json` output
```

The harness then keeps you cycling until the wave is genuinely done.

## Worked example

```bash
quest list --ready --json     # → [{"id":12,"worker":"claude"…},{"id":13,"worker":"codex"…}]
# 12 → dispatch quest-executor subagent (model/effort from the record)
# 13 → background Bash: quest-run 13
# …executor stops →
quest show 12 --json          # new checkpoint? quest_status? evidence?
# reviewer on 12's diff → findings dispositioned → accept
```

**Next:** contracts weak? `/quest:plan` to fix them first. Wave finished?
`/quest:retro`. Vocabulary and stop rules: `/quest:protocol`.
