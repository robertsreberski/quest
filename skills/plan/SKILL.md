---
name: plan
description: Turn an idea, feature request, or bug into quest contracts. Use when planning work as quests, decomposing a large ask into an epic with waves, or when asked to "create a quest" for something.
argument-hint: "<the ask>"
---

# Plan work as quests

**What this does:** decomposes an ask into one or more quest contracts —
Objective, evidence-checkable Done-when, exact Validation loop — written via
`quest create`.
**Use when:** turning any ask into executable, verifiable units of work.
**Input:** the ask, plus whatever code/context you need to read to size it.
**What you get:** lint-clean quest record(s) an executor can run with zero
extra context.

## Size it first

| Size | Shape | Rule of thumb |
|---|---|---|
| Small | 1 quest, work it inline now | one sitting, one validation run |
| Medium | 1 quest, dispatch an executor | needs iterations, fits one Objective |
| Large | epic parent + child quests in waves | multiple objectives; order via `depends_on` |

For epics: create the parent first, then children with `--parent <id>` and
`--depends-on` expressing the real order. `quest list --ready` becomes the
dispatch queue — that is the whole wave mechanic.

Keep the **epic itself thin**. Its Done-when is **integration-level only**: it
checks that the children compose into a working whole (the end-to-end behavior,
the parity gate, the shipped docs), never a restatement of each child's
Done-when. Its milestones must **not mirror the children 1:1** — the children
*are* the decomposition, so re-listing them in the epic body earns no worker and
wastes review. Give the epic an objective, integration Done-when, and the
validation loop the orchestrator runs to close it inline (it is never
dispatched — see `/quest:orchestrate` "Closing an epic").

## Author the contract

Every field earns its place:

- **Objective** (≤3 sentences): one concrete outcome. It is the anchor — it
  will never be rewritten, so don't bury multiple outcomes in it.
- **Done when**: each item independently checkable WITH EVIDENCE. Write the
  check into the item ("`npm test` passes including new theme tests"), not a
  vibe ("works well").
- **Validation loop**: the exact commands the executor runs every iteration.
  If you can't state them, the quest isn't ready to dispatch.
- **Constraints**: what must hold along the way (not a wish list).
- **Milestones**: discrete testable units for anything beyond one sitting.
- **Context**: files + symbols (`resolveConfig` in `lib/config.mjs`), related
  quests. NEVER bare line numbers — they rot.
- **Out of scope**: the adjacent work you are explicitly not doing.
- `--worker` / `--model` / `--effort` / `--max-iterations`: match the tier to
  the difficulty; the defaults come from `.quests/config.json`.

**Anti-patterns** (lint catches some, you catch the rest): adjective done-whens
("fast", "clean"); validation loops that are prose, not commands; objectives
hiding three objectives; context by line number; budgets so big they never bind.

## Worked example

```bash
quest create --title "Add dark mode to settings" \
  --objective "The settings page offers a dark theme that persists across reloads." \
  --done-when "toggling theme switches the UI and survives reload" \
  --done-when "\`npm test\` passes including new theme tests" \
  --validation "npm test" \
  --constraint "no new dependencies" \
  --milestone "theme toggle renders and switches CSS variables" \
  --milestone "choice persists via localStorage" \
  --context "Settings page: src/settings/Page.tsx; theme tokens: src/theme.ts" \
  --out-of-scope "system-preference auto-detection"
quest lint 12   # always, before dispatch
```

**Next:** dispatch with `/quest:orchestrate` (or work it yourself via
`/quest:work <id>`). Rules and vocabulary: `/quest:protocol`.
