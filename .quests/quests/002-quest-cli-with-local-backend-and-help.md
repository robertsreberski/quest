---
id: 2
title: quest CLI with local backend and help layer
status: todo
priority: p0
worker: claude
model: inherit
max_iterations: 8
depends_on: [1]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T13:12:31Z
---

# quest CLI with local backend and help layer

## Objective
Ship `bin/quest` implementing the full command surface against the local
backend with zero runtime dependencies, the exit-code contract, `--json`
machine mode, and a first-class help/guidance layer.

## Done when
- [ ] Commands work end-to-end on the local backend: `init`, `create`, `list`
      (`--status`, `--parent`, `--ready`), `show`, `start`, `checkpoint`,
      `cancel`, `edit`, `lint`, `amend`, `protocol`, `runs`; all support `--json`.
- [ ] Exit codes match contract-spec (0/2/3/4/5/6); illegal transitions and
      malformed frontmatter fail with exit 5 and a precise message + next-step hint.
- [ ] Help layer: bare `quest` prints store state + suggested next commands;
      every command has `--help` with purpose, flags, and a copy-pasteable
      example; `quest init` ends with a guided next-steps block. Help output is
      snapshot-tested.
- [ ] `node --test tests/` green, including a full lifecycle round-trip
      (init → create → start → checkpoint → complete → list/show --json) in a
      temp dir, and frontmatter reject cases.
- [ ] `quest lint --all` passes on this repo's hand-written bootstrap store.
- [ ] This quest's own completion checkpoint is recorded via the CLI itself.

## Validation loop
```bash
node --test tests/
node bin/quest lint --all
node bin/quest show 2 --json
```

## Constraints
- Zero runtime dependencies (node:util parseArgs, node:test only).
- The CLI is the single write path: no other code writes quest records.
- Strict YAML subset per contract-spec — reject, never best-effort parse.
- Fail honestly: no fallback that masks a broken store.

## Milestones
- [ ] M1 — frontmatter + contract parse/serialize/lint (`lib/frontmatter.mjs`, `lib/contract.mjs`)
- [ ] M2 — local store lifecycle (`lib/store-local.mjs`) + config resolution (`lib/config.mjs`)
- [ ] M3 — CLI dispatch, exit codes, `--json` (`lib/cli.mjs`, `bin/quest`)
- [ ] M4 — help/guidance layer + snapshot tests
- [ ] M5 — lifecycle round-trip test green on bootstrap store; checkpoint via CLI

## Context
Format contract: `skills/protocol/references/contract-spec.md` (the round-trip
target). Protocol: `skills/protocol/references/protocol.md`.

## Out of scope
- GitHub backend (quest 3), runner (quest 5), hooks (quest 6).

## Checkpoints
