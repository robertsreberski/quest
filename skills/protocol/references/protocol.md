# The quest loop protocol

This is the base protocol every quest execution follows. Local amendments (mined
from retros, see `/quest:retro`) live in `.quests/amendments.md` and extend this
document — read both. `quest protocol` prints them together.

## Vocabulary

- A **quest** is a goal contract: one Objective, evidence-checkable "Done when"
  conditions, a Validation loop of exact commands, Constraints, and optional
  Milestones. The record format is defined in [contract-spec.md](./contract-spec.md).
- **Store status** (record lifecycle): `todo | in_progress | blocked | complete | cancelled`.
- **quest_status** (checkpoint verdict, the only vocabulary allowed in
  checkpoints): `in_progress | complete | blocked`.
- A **checkpoint** is an evidence-citing progress entry appended to the quest
  record via `quest checkpoint`. Checkpoints are the resume artifact: a fresh
  session with zero prior context must be able to continue the quest from the
  record and its checkpoints alone.

## The loop

Each iteration:

1. **Orient.** Read the full quest record (`quest show <id>`), the protocol
   (`quest protocol`), all prior checkpoints, and the referenced files. Check
   recent history (`git log --oneline -5`). Re-verify every reference cited in
   the record — cite **symbol + file** (`resolveConfig` in `lib/config.mjs`),
   never bare line numbers, which rot within hours. If a cited reference is
   stale, post the correction in your first checkpoint.
2. **One milestone per iteration.** Pick the smallest unfinished milestone and
   implement it end-to-end. If the quest has no milestones, treat the whole
   Objective as one milestone.
3. **Verify with the stated validation loop.** Run the quest's Validation loop
   commands exactly as written. **Never silently substitute a different check**
   for a stated one — if an equivalent check must be used, name the
   substitution and why in the checkpoint.
4. **Commit green, never red.** Commit the verified milestone with a clear
   message. Do not commit failing states.
5. **Checkpoint.** Record progress via `quest checkpoint` using the canonical
   fields (see contract-spec). `validation_summary` cites exact commands and
   their observed results — commands, not adjectives. Floor: at least one
   checkpoint at completion, plus one at any blocker; per-milestone checkpoints
   when a quest has more than 4 milestones.
6. **Evaluate stop conditions.**
   - `complete` — every "Done when" item is enumerated as
     **Done / Blocked / Cancelled** with its evidence, and no new TODOs or
     follow-up work remain inside this quest (file a new quest instead).
   - `blocked` — (a) two consecutive iterations failing on the same error,
     (b) a decision only a human can make, or (c) an unsatisfiable "Done when"
     — name the exact discrepancy and the corrected anchor; **never improvise
     a replacement**. Record the blocker precisely and stop.
   - **Budget** — respect `max_iterations` (and cost caps where enforced); if
     exceeded, checkpoint `blocked` with the reason and stop.

## Scope fence

Implement exactly and only the Objective. Scope may **compatibly expand**
(additions that serve the same Objective) with explicit rationale recorded via
`quest edit --rationale` or a `compatible_expansion` checkpoint field. The
Objective and existing "Done when" anchors are never rewritten. Adjacent
improvements go into new quests.

## Honesty rules

- Never edit or delete existing tests to make them pass.
- Never hide failures behind fallbacks or fake success states; surface the real
  error and fail loudly.
- Report outcomes faithfully: failing checks are reported as failing, skipped
  steps as skipped.

## Review disposition

Every external review finding (human or automated) gets an explicit disposition
before the work merges: **fixed**, **follow-up quest filed** (linked), or
**rejected with reason**. Unreplied findings are protocol violations.

## Orchestrator rulings

When reviewing a finished iteration or run, the orchestrator rules one of:

- **accept** — the checkpoint's evidence actually satisfies the Done-when items
  it claims (quote the commands; never accept adjectives).
- **iterate-with-feedback** — send the specific gap back to the executor.
- **split** — the quest was bigger than it looked; decompose via `/quest:plan`.
- **escalate-to-human** — human-only decisions are surfaced verbatim, never
  guessed.

## Sizing

- **Small** — one quest, worked inline in the current session.
- **Medium** — one quest dispatched to an executor (subagent or headless run).
- **Large** — an epic (parent quest) with child quests in dependency waves via
  `depends_on`; orchestrate wave by wave.
