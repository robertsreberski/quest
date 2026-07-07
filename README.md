# quest

Goal-loop engineering for coding agents — one plugin for **Claude Code** and
**Codex**, plus a zero-dependency CLI.

quest turns asks into **evidence-checkable contracts** ("quests"), executes them
in **iterative loops that end in verifiable checkpoints**, orchestrates **Claude
and Codex workers** (in-session or headless, serial or parallel), and mines
retrospectives into **numbered protocol amendments** your future sessions
actually read.

- `quest` — the quest store: contracts, checkpoints, wave scheduling. Local
  markdown files by default; GitHub Issues opt-in.
- `quest-run` — the headless runner: drives `claude -p` or `codex exec` workers
  in native goal mode with deterministic budgets and notifications.
- Five skills — `/quest:plan`, `/quest:work`, `/quest:orchestrate`,
  `/quest:retro`, `/quest:protocol`.
- Two agents — `quest-executor`, `quest-reviewer`.

## The idea in 30 seconds

```
you:    /quest:plan add dark mode to the settings page
agent:  creates quest 12 — Objective, Done-when, Validation loop… (quest create)
you:    /quest:orchestrate
agent:  dispatches a worker on quest 12; it iterates: milestone → validate →
        commit → checkpoint. You review evidence, not vibes.
```

Every quest ends in a checkpoint trail a fresh session can resume from — that is
the whole trick.

## Install

### Claude Code

```bash
claude plugin marketplace add robertsreberski/quest
```

Then, inside a Claude Code session:

```
/plugin install quest@quest
```

For local development against a checkout, point Claude Code at the repo directly
— no marketplace needed:

```bash
claude --plugin-dir .
```

### Codex

The plugin ships a `.codex-plugin/` manifest and discovers its skills from the
repo checkout (`skills/`, surfaced under `.agents/` for Codex). Until a public
Codex marketplace listing is approved upstream, wire it up from a clone or
submodule:

```bash
git clone https://github.com/robertsreberski/quest
# add the checkout to your Codex plugin/skill discovery path (clone or submodule)
```

The CLI (`quest`, `quest-run`) is harness-agnostic — it works the same whether
you drive it from Claude Code, Codex, or a plain shell.

## Quickstart

Create a store in your project, author a quest, check it, and work it:

```bash
# 1. Create a quest store (.quests/) here
quest init

# 2. Author a quest — the CLI is the only way records are born
quest create --title "Add dark mode" \
  --objective "Settings page offers a dark theme that persists." \
  --done-when "toggling theme updates the UI and survives reload" \
  --done-when "\`npm test\` passes including new theme tests" \
  --validation "npm test"

# 3. Check it against the contract spec
quest lint --all

# 4. See what's ready to work (dependencies met)
quest list --ready
```

Work the quest **in-session** with the skill:

```
/quest:work 12
```

…or **headless** with the runner:

```bash
quest-run 12
```

Each iteration ends by recording evidence — a checkpoint a fresh session can
resume from:

```bash
quest checkpoint 12 --status complete \
  --summary "M2 done — theme persistence via localStorage" \
  --validation "\`npm test\` → 42 passed, 0 failed"
```

Run `quest <command> --help` for flags and a copy-pasteable example of any
command.

## The loop

A quest is a goal contract: one Objective, evidence-checkable *Done-when*
conditions, a Validation loop of exact commands, and optional milestones. Each
iteration picks the smallest unfinished milestone, implements it end-to-end,
runs the Validation loop **exactly as written**, commits green, and records a
checkpoint citing the commands it ran and what they returned. A quest is
`complete` only when every Done-when item is enumerated with its evidence. The
full base protocol lives in
[`skills/protocol/references/protocol.md`](./skills/protocol/references/protocol.md)
(print it, with this store's local amendments, via `quest protocol`).

## CLI overview

| Command | Purpose |
|---|---|
| `quest init` | Create a quest store (`.quests/`) in the current directory |
| `quest create` | Create a new quest (the only way records are born) |
| `quest list` | List quests (filter by status, parent, or readiness) |
| `quest show` | Show a quest record in full |
| `quest start` | Mark a quest in_progress (todo → in_progress) |
| `quest checkpoint` | Record iteration evidence and drive the quest's status |
| `quest cancel` | Cancel a quest (terminal; reason is recorded) |
| `quest edit` | Compatibly expand a quest (additions only; anchors are immutable) |
| `quest lint` | Check records against the contract spec |
| `quest amend` | Append a numbered protocol amendment (retro output) |
| `quest protocol` | Print the loop protocol + this store's local amendments |
| `quest runs` | Show headless runner activity (from `.quests/runs.ndjson`) |

## quest-run (headless runner)

`quest-run <id>` drives a worker through the same loop without you in the chair:

- **Workers** — `claude` (`claude -p`) or `codex` (`codex exec`), selected per
  quest. Both run in **native goal mode** with a machine-verifiable completion
  condition.
- **Budgets** — deterministic iteration, cost, and token caps; two sessions
  without a new checkpoint auto-writes a `blocked` checkpoint and stops.
- **`--parallel N`** — with `--ready`, promotes and works newly-ready quests
  across dependency waves, up to N at a time.
- **`--notify '<cmd>'`** — runs a templated command on run start/stop so you get
  pinged; notify failures are isolated from the run.

Inspect activity with `quest runs --active`.

> **Note:** `quest-run` ships with this build's runner milestone (tracked as
> quest 5). On a pre-0.1.0 checkout where `bin/quest-run` isn't present yet, use
> `/quest:work` in-session instead.

## Store backends

- **`local`** (default) — records are markdown files under `.quests/quests/`;
  config, amendments, and the runs journal stay local. Zero dependencies.
- **`github`** (opt-in) — `quest init --backend github --repo owner/name` stores
  records as GitHub Issues via the `gh` CLI (labels mirror status/priority;
  checkpoints become issue comments). Config, amendments, and runs stay local.

```bash
quest init --backend github --repo owner/name
```

> **Note:** the GitHub backend is landing in this build (tracked as quest 3).
> Until it ships, use the default `local` backend.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 2 | usage error (bad flags/arguments) |
| 3 | no quest store found / config invalid |
| 4 | quest not found |
| 5 | contract violation (lint failure, malformed record, illegal transition) |
| 6 | backend unavailable (`gh` missing, unauthenticated, network) |
| 10 | (`quest-run`) ended blocked |
| 11 | (`quest-run`) budget exhausted |

## Status

The build of quest is itself tracked as quests — see [`.quests/`](./.quests/).
Contributions welcome; see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
