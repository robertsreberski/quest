---
name: retro
description: Mine finished quest traces into numbered protocol amendments. Use when a quest or wave just finished, when the same failure appeared twice, or when asked to run a retrospective.
---

# Retro — turn traces into amendments

**What this does:** examines what actually happened (checkpoints, diffs, review
threads) and encodes the deltas as numbered amendments future sessions read.
**Use when:** a wave completed, a quest went sideways, or evidence contradicts
the current protocol.
**Input:** the finished quests' records and their surrounding artifacts.
**What you get:** `.quests/amendments.md` entries served to every future orient
via `quest protocol` — the loop that improves the loop.

## Procedure

1. **Gather evidence:**
   ```bash
   quest list --status complete --json && quest list --status blocked --json
   quest show <id>            # read the checkpoint trails, not your memory
   git log --oneline -20
   ```
2. **Mine for deltas** — ask, with evidence:
   - Where did a stated check get silently substituted?
   - What blocked twice for the same reason? What reference had rotted?
   - Which checkpoint could a fresh session NOT have resumed from?
   - Where did vocabulary drift (statuses invented, fields skipped)?
   - What did a reviewer catch that the validation loop should have?
3. **Write amendments** — imperative, numbered, each citing its evidence:
   ```bash
   quest amend --text "State the expected test count in validation_summary — quest 12's 'tests pass' hid three skipped tests (checkpoint 2026-07-07T14:32Z)."
   ```
   One behavioral change per amendment. No platitudes — if it doesn't change
   what the next executor does, it's not an amendment.
4. **Record what worked** as a "keep doing" amendment when a practice earned
   its keep (evidence included) — protocols erode when only failures get ink.
5. **Nothing to amend?** Say so explicitly: an honest "no deltas this wave"
   entry beats silence.

## Worked example

```bash
quest show 12   # blocked twice on the same flaky test before anyone noticed
quest amend --text "Treat a test that fails twice in one quest as a blocker to escalate, not to retry — quest 12 burned 3 iterations rerunning a flaky suite (checkpoints 3–5)."
quest protocol  # confirm the amendment now rides along
```

**Next:** amendments feed every future `/quest:work` orient automatically.
Start the next wave with `/quest:orchestrate`.
