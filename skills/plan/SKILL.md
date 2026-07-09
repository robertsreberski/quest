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

## Plan Mode handoff

In Codex Plan Mode, do **not** implement product code after the user accepts a
plan. The same parent agent/session that processes `$quest:plan` owns the
handoff: make the quest records real, then adopt `$quest:orchestrate` by
default when the user asks to implement the plan. The parent session never uses
`$quest:work <id>` after a Plan Mode handoff unless the user explicitly asks to.

1. Create or confirm the quest records with `quest create` and `quest lint`.
2. If the user accepted a plan and asked to implement it, the same parent
   session becomes `$quest:orchestrate`, not `$quest:work`. Do not start editing
   product code in the parent session. Read skill `$quest:orchestrate` and follow its rules for dispatching workers and closing epics inline.
3. In `$quest:orchestrate`, inspect `quest list --queue --json`, set the
   orchestrator goal for the wave, then spawn goal-mode workers for
   `worker_ready` quests.
4. Stop after listing the ready quest ids and validation commands only when the
   user explicitly asked for create-only/no-dispatch behavior such as "only
   create quests", "do not dispatch", or "stop after planning".

The parent session owns dispatch, checkpoint verification, reviewer rulings, and
epic closure. The spawned executor owns implementation for exactly one quest.
The parent session never uses `$quest:work <id>` after a Plan Mode handoff
unless the user explicitly asks to bypass orchestration for a genuinely small
single quest.

For epics: create the parent first, then children with `--parent <id>` and
`--depends-on` expressing the real order. `quest list --queue --json` shows the
wave order: `worker_ready` quests are dispatched, and
`inline_close_ready_epics` are closed inline by the orchestrator after children
finish. `quest list --ready` remains only the dispatch shortcut for
`worker_ready`.

When local checkout, plugin cache, and installed package versions can differ,
author and lint with the checkout binary (`./bin/quest`) or verify `PATH` with
`quest --version` before relying on queue semantics or generated records.

Keep the **epic itself thin**. Its Done-when is **integration-level only**: it
checks that the children compose into a working whole (the end-to-end behavior,
the parity gate, the shipped docs), never a restatement of each child's
Done-when. Its milestones must **not mirror the children 1:1** — the children
*are* the decomposition, so re-listing them in the epic body earns no worker and
wastes review. Give the epic an objective, integration Done-when, and the
validation loop the orchestrator runs to close it inline (it is never
dispatched — see `$quest:orchestrate` "Closing an epic").

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
- `--worker`, `--model`, and `--effort`: always specify all three explicitly in
  every `quest create` command you author. Pick them deliberately from the task's
  risk, ambiguity, context size, and validation cost so the worker starts with
  an intentional execution profile instead of inheriting blindly from defaults.
- `--max-iterations`: match the loop budget to the difficulty; defaults in
  `.quests/config.json` are fallback behavior, not a planning substitute.

**Anti-patterns** (lint catches some, you catch the rest): adjective done-whens
("fast", "clean"); validation loops that are prose, not commands; objectives
hiding three objectives; context by line number; budgets so big they never bind.

## Worked example

```bash
quest create --worker codex --model gpt-5.5 --effort medium --max-iterations 4 \
  --title "Add dark mode to settings" \
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

**Next:** dispatch with `$quest:orchestrate`. Only work it yourself via
`$quest:work <id>` for genuinely small inline work outside Plan Mode and outside
an accepted Plan Mode handoff, when user explicitly asked for it. Rules and vocabulary: `$quest:protocol`.
