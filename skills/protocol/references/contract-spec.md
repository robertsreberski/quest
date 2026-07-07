# Quest record format specification

This is the byte-level contract for quest records. The `quest` CLI is the
single write path — records are only created and mutated through it, in both
backends. Everything here round-trips through `lib/contract.mjs`.

## Store layout (local backend)

```
.quests/
├── config.json        # backend selection + defaults
├── quests/            # one file per quest: NNN-slug.md
├── amendments.md      # numbered protocol amendments (always local)
└── runs.ndjson        # runner journal (always local, gitignore-able)
```

`NNN` is the zero-padded quest id (`001`, `002`, …). `slug` is derived from the
title: lowercase, `[a-z0-9-]`, max 40 chars.

## config.json

```json
{
  "backend": "local",
  "github": { "repo": "owner/name" },
  "defaults": {
    "worker": "claude",
    "claude": { "model": "opus", "effort": "xhigh" },
    "codex": { "model": "gpt-5.5", "reasoning_effort": "medium" },
    "max_iterations": 8,
    "priority": "p2"
  },
  "notify": { "command": "" }
}
```

Resolution order: `QUEST_DIR` env (points at a `.quests/` dir) →
`QUEST_BACKEND` env (overrides backend only) → nearest `.quests/config.json`
walking up from cwd. Not found → every command except `init` exits `3`.

## Frontmatter (strict YAML subset)

Only two shapes are legal: `key: scalar` and `key: [a, b, c]` (inline list).
No nesting, no multi-line values, no quotes-with-escapes. Optional keys are
**omitted entirely**, never `null`. The parser rejects anything else with a
precise error (exit 5) — there is no best-effort mode.

```yaml
---
id: 12
title: Add --json output to the list command
status: todo
priority: p2
worker: claude
model: inherit
max_iterations: 8
parent: 3
depends_on: [10, 11]
created: 2026-07-07T12:00:00Z
updated: 2026-07-07T14:00:00Z
---
```

| Field | Required | Values |
|---|---|---|
| `id` | yes | positive integer, store-assigned |
| `title` | yes | plain string |
| `status` | yes | `todo \| in_progress \| blocked \| complete \| cancelled` |
| `priority` | yes | `p0 \| p1 \| p2` |
| `worker` | yes | `claude \| codex` |
| `model` | yes | verbatim model string passed to the worker, or `inherit` (use config default) |
| `effort` | no | reasoning effort passed to the worker (e.g. `xhigh`); omitted = config default |
| `max_iterations` | yes | positive integer (counts runner **sessions**) |
| `max_cost` | no | USD number; omitted = uncapped |
| `parent` | no | quest id (epic linking; children derived by scanning) |
| `depends_on` | no | list of quest ids (wave ordering) |
| `created` / `updated` | yes | UTC ISO-8601 `…Z` |

## Body sections (canonical order)

`## Objective`, `## Done when`, `## Validation loop` are lint-required; the
rest are optional but keep this order when present.

```markdown
# {title}

## Objective
One concrete outcome, at most 3 sentences. This is the anchor — it may be
compatibly expanded, never redefined.

## Done when
- [ ] Each item independently checkable, with evidence.
- [ ] Adjectives are not evidence; commands and observable outcomes are.

## Validation loop
```bash
<exact commands the executor runs each iteration>
```

## Constraints
- Hard guardrails that must hold along the way.

## Milestones
- [ ] M1 — discrete testable unit
- [ ] M2 — …

## Context
Pointers: files + symbols (never bare line numbers), docs, related quests.

## Out of scope
- Explicit exclusions.

## Checkpoints
(append-only; written by `quest checkpoint` only)
```

## Checkpoint block

Identical bytes in both backends (local: appended under `## Checkpoints`;
GitHub: an issue comment). The HTML marker makes discovery deterministic.

```markdown
<!-- quest:checkpoint -->
### 2026-07-07T14:32:00Z — quest_status: in_progress
- iteration: 2
- pr: https://github.com/owner/repo/pull/12
- head_sha: abc1234
- changed: M2 done — one line per milestone touched
- validation_summary: `npm test` → 42 passed, 0 failed; `quest lint 12` → exit 0
- failed_approaches: tried X; failed because Y
- compatible_expansion: added done-when item Z because …

Optional free-form note.
```

- `quest_status` ∈ `in_progress | complete | blocked` — the only legal values.
- `iteration` required; `pr`, `head_sha`, `failed_approaches`,
  `compatible_expansion` optional.
- `validation_summary` required. When `quest_status: complete`, lint requires
  at least one backticked command in it (commands, not adjectives).
- A checkpoint's `quest_status` drives the store `status` transition:
  `in_progress → in_progress`, `complete → complete`, `blocked → blocked`.

## Status transitions

```
todo → in_progress            (quest start, or first checkpoint)
in_progress → complete        (checkpoint quest_status: complete)
in_progress → blocked         (checkpoint quest_status: blocked)
blocked → in_progress         (new checkpoint quest_status: in_progress)
todo|in_progress|blocked → cancelled   (quest cancel --reason)
```

Any other transition is illegal (exit 5). `complete` and `cancelled` are
terminal.

## GitHub backend mapping

| Concept | Local | GitHub (`gh` only) |
|---|---|---|
| record | `quests/NNN-slug.md` | issue; body = same body sections |
| orchestration metadata | frontmatter | `<!-- quest:meta -->` HTML block at top of body (same `key: value` lines) |
| id | frontmatter `id` | issue number |
| status | frontmatter | labels `quest:todo\|in-progress\|blocked\|complete\|cancelled` (+ marker label `quest`); issue state mirrored (complete → closed-completed, cancelled → closed-not-planned) |
| priority | frontmatter | labels `quest-p0\|p1\|p2` |
| checkpoint | appended section | issue comment, identical bytes |
| parent/child | child `parent:` | child meta `parent:` + epic body `## Children` task list (`- [ ] #12`) |
| config, amendments, runs | `.quests/` | still `.quests/` local — only records live remotely |

Fail-honest: every `gh` failure surfaces gh's own stderr and exits `6`. There
is no fallback from `github` to `local`.

## Worker final-report schema

Headless workers end each session with a final message conforming to
`schemas/final-report.schema.json`:

```json
{
  "quest_status": "in_progress | complete | blocked",
  "checkpoint_recorded": true,
  "evidence_summary": "one line citing the decisive command + result"
}
```

## CLI exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 2 | usage error (bad flags/arguments) |
| 3 | no quest store found / config invalid |
| 4 | quest not found |
| 5 | contract violation (lint failure, malformed record, illegal transition, missing checkpoint fields) |
| 6 | backend unavailable (gh missing, unauthenticated, network) |

Runner (`quest-run`) adds: `10` ended blocked · `11` budget exhausted.
