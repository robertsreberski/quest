---
id: 12
title: Configurable codex sandbox mode for git-commit quests
status: complete
priority: p2
worker: claude
model: inherit
max_iterations: 8
depends_on: [11]
created: 2026-07-07T14:37:49Z
updated: 2026-07-07T15:17:34Z
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

<!-- quest:checkpoint -->
### 2026-07-07T15:17:34Z — quest_status: complete
- iteration: 1
- head_sha: 914bcf1
- changed: codex sandbox mode is configurable: --codex-sandbox flag + config defaults.codex.sandbox → codex exec --sandbox; default unchanged (workspace-write); help+README document the git-commit tradeoff honestly; 5 new tests.
- validation_summary: `npm test` → tests 80, pass 80, fail 0 (75 baseline + 5 new). New: `codex: --codex-sandbox flag flows into the built codex invocation args` (asserts args[i+1]==='danger-full-access'), `codex: default sandbox is workspace-write`, `codex: config defaults.codex.sandbox selects the sandbox`, `codex: --codex-sandbox flag overrides config default`, `codex: --codex-sandbox rejects an illegal value with a usage error (exit 2)`. Live: `node bin/quest-run 12 --codex-sandbox yolo --dry-run` → exit 2 'must be one of read-only, workspace-write, danger-full-access'; `node bin/quest-run 12 --worker codex --codex-sandbox danger-full-access --dry-run --json` → sandbox arg = danger-full-access. Symbol: `codex.buildInvocation` in lib/workers.mjs now emits `opts.codexSandbox ?? DEFAULT_CODEX_SANDBOX`; resolution+validation in `resolveOptions` in lib/runner.mjs (flag → config.defaults.codex.sandbox → workspace-write).

Done-when: (1) --codex-sandbox flag + config defaults.codex.sandbox select the mode, default stays workspace-write — DONE (exported CODEX_SANDBOX_MODES/DEFAULT_CODEX_SANDBOX in workers.mjs; resolveOptions validates flag→config→default; default-behavior test green). (2) help + README document the workspace-write git-commit limitation and the danger-full-access opt-in tradeoff honestly, no silent escalation — DONE (quest-run --help flag+note; README quest-run section bullet). (3) npm test green incl. a test asserting the flag flows into the codex invocation — DONE (80/80; the flag-flows test inspects the built --sandbox arg). Files touched: lib/workers.mjs, lib/runner.mjs, tests/runner.test.mjs, README.md (config.mjs untouched — loadConfig already merges raw.defaults.codex through). Scope: wired buildInvocation (the named symbol) only; buildResume left as-is (relies on codex session sandbox inheritance) — resume-sandbox propagation is a follow-up if live smoke shows it needed. No git commit/push performed.
