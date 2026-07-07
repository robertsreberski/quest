---
id: 12
title: Configurable codex sandbox mode for git-commit quests
status: todo
priority: p2
worker: claude
model: inherit
max_iterations: 8
depends_on: [11]
created: 2026-07-07T14:37:49Z
updated: 2026-07-07T14:37:49Z
---

# Configurable codex sandbox mode for git-commit quests

## Objective
quest-run lets codex workers commit to git when the quest requires it, via an explicit opt-in sandbox knob instead of the hardcoded workspace-write.

## Done when
- [ ] a --codex-sandbox flag (and config defaults.codex.sandbox) selects the codex exec sandbox mode, default stays workspace-write
- [ ] help text and README document the git-commit limitation of workspace-write and the danger-full-access opt-in tradeoff honestly
- [ ] `npm test` green including a test asserting the flag flows into the codex invocation

## Validation loop
```bash
npm test
```

## Constraints
- default remains the safe workspace-write; no silent escalation

## Context
Found during quest 8's walkthrough: codex exec under workspace-write cannot write .git (index.lock failure, confirmed empirically in /tmp and home-dir repos). Symbol: codex adapter buildInvocation in lib/workers.mjs

## Checkpoints
