---
name: protocol
description: The quest loop rules, checkpoint format, and vocabulary. Use when you need the protocol itself — stop conditions, checkpoint fields, status enums, scope-fence rules — or when judging whether a quest was worked correctly.
---

# The quest protocol

**What this does:** gives you the canonical rules every quest execution follows.
**Use when:** working, orchestrating, reviewing, or planning quests and you need
the exact rule — don't paraphrase from memory.
**Input:** none.
**What you get:** the base protocol + this store's local amendments.

## Read it

- [references/protocol.md](references/protocol.md) — the loop: orient → one
  milestone → verify with stated commands → commit green → checkpoint →
  stop conditions (`complete` needs every Done-when enumerated with evidence;
  `blocked` beats improvising), scope fence, honesty rules, rulings, sizing.
- [references/contract-spec.md](references/contract-spec.md) — the record
  format: frontmatter fields, body sections, checkpoint bytes, GitHub mapping,
  exit codes.

In a store, prefer the CLI — it appends the store's own amendments:

```bash
quest protocol
```

## The vocabulary that matters most

- Store status: `todo | in_progress | blocked | complete | cancelled`.
- Checkpoint verdict (`quest_status`): `in_progress | complete | blocked` — the
  ONLY legal checkpoint vocabulary.
- A `complete` checkpoint cites backticked commands in `validation_summary`
  and enumerates every Done-when item as Done / Blocked / Cancelled.

**Next:** plan with `$quest:plan`, execute with `$quest:work`, drive with
`$quest:orchestrate`, improve with `$quest:retro`.
