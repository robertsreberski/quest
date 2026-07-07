---
name: work
description: Execute one quest iteratively to a checkpointed stop. Use when asked to work a quest by id, when dispatched as a quest executor, or when resuming a quest a previous session left in_progress or blocked.
argument-hint: "<quest-id>"
---

# Work a quest

**What this does:** runs the quest loop on ONE quest — iterate in small verified
increments until the quest is `complete` or honestly `blocked`.
**Use when:** you were given a quest id to execute (by a human or an orchestrator).
**Input:** a quest id; the record is the whole spec — no other context is assumed.
**What you get:** working, committed changes plus a checkpoint trail any fresh
session can resume from.

## The iteration

1. **Orient** (every session, no exceptions):
   ```bash
   quest show <id> --json     # the contract + prior checkpoints
   quest protocol             # the rules + this store's amendments
   git log --oneline -5
   ```
   If the quest is `todo`, run `quest start <id>`. Re-verify every file/symbol
   reference cited in the record; if one is stale, say so in your first checkpoint.
2. **Pick the smallest unfinished milestone** (or the whole Objective if there
   are none) and implement it end-to-end.
3. **Verify with the quest's stated Validation loop** — run those commands
   exactly. If you must substitute an equivalent check, name the substitution
   and why in the checkpoint. Never invent a friendlier check.
4. **Commit green, never red.**
5. **Checkpoint** — the only way progress exists:
   ```bash
   quest checkpoint <id> --status in_progress \
     --summary "M2 done — <one line per milestone touched>" \
     --validation "\`npm test\` → 42 passed, 0 failed"
   ```
6. **Check stop conditions** (see `/quest:protocol` for the full rules):
   - All Done-when items hold with evidence → final checkpoint with
     `--status complete`, whose `--note` enumerates EVERY Done-when item as
     Done / Blocked / Cancelled with its evidence.
   - Same error two iterations in a row, a human-only decision, or an
     unsatisfiable Done-when → `--status blocked` naming the exact blocker.
     Blocked is a good stop; improvising past it is not.
   - Budget (`max_iterations`) exceeded → blocked with reason.
   Otherwise: loop to step 2.
7. **End every session by displaying the state** — run `quest show <id>` so the
   recorded checkpoint is visible in the conversation (goal-mode evaluators and
   orchestrators verify from it).

## Scope fence

Implement exactly and only the Objective. Additions that serve the same
objective go through `quest edit <id> --add-done-when … --rationale …`.
Adjacent improvements: note them for a NEW quest; never fold them in.

## Worked example

```bash
quest show 12 --json          # objective: "settings page offers dark mode…"
quest start 12
# …implement milestone M1, then:
npm test                      # the quest's stated validation loop
git commit -m "feat: dark mode toggle (quest 12, M1)"
quest checkpoint 12 --status in_progress \
  --summary "M1 — theme toggle renders and switches CSS vars" \
  --validation "\`npm test\` → 38 passed"
quest show 12
```

**Next:** finished or blocked → the orchestrator (or human) rules on your
checkpoint — see `/quest:orchestrate`. Learned something protocol-worthy →
mention it so `/quest:retro` can turn it into an amendment.
