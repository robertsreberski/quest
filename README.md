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
  with deterministic budgets, notifications, and checkpoint-based stop checks.
- Six skills — `$quest:plan`, `$quest:work`, `$quest:orchestrate`,
  `$quest:retro`, `$quest:protocol`, `$quest:setup`.
- Two native-agent templates — `quest-executor`, `quest-reviewer`.

## The idea in 30 seconds

```
you:    $quest:plan add dark mode to the settings page
agent:  creates quest 12 — Objective, Done-when, Validation loop… (quest create)
agent:  becomes $quest:orchestrate and dispatches a worker on quest 12:
        milestone → validate →
        commit → checkpoint. You review evidence, not vibes.
```

Every quest ends in a checkpoint trail a fresh session can resume from — that is
the whole trick.

## Install

### CLI (any environment)

```bash
npm install -g quest-loop
```

Puts `quest` and `quest-run` on your PATH everywhere — no harness required.
The plugin installs below add the skills, hooks, and native-agent setup on top.

### Claude Code

```bash
claude plugin marketplace add robertsreberski/quest
```

Then, inside a Claude Code session:

```
/plugin install quest@quest
```

Install Quest's project-scoped Claude agent templates and verify the local
Claude setup with:

```bash
quest claude install-agents --scope project
quest claude doctor
```

For local development against a checkout, point Claude Code at the repo directly
— no marketplace needed:

```bash
claude --plugin-dir .
```

### Codex

The plugin ships a `.codex-plugin/` manifest plus the same Git marketplace
metadata used by Claude Code. Install the marketplace once, then install the
plugin from that marketplace:

```bash
codex plugin marketplace add robertsreberski/quest
codex plugin add quest@quest
```

Start a new Codex thread after installing so the skills and hooks are loaded.
Verify the install with:

```bash
codex plugin list --marketplace quest
quest codex install-agents --scope project
quest codex doctor
codex debug prompt-input "noop"
```

`quest codex doctor` checks the installed plugin version, Codex `multi_agent`
support, hook parser, neutral skill roots, and installed native-agent templates.
`codex debug prompt-input "noop"` should not print any hook parse warnings.

#### Updating the Codex plugin

Codex installs plugins from a marketplace snapshot. Pulling this Git repo or
publishing a new tag is not enough to update the already-installed plugin cache.
Refresh the marketplace snapshot, then reinstall the plugin from it:

```bash
codex plugin marketplace upgrade quest
codex plugin add quest@quest
codex plugin list --marketplace quest
quest codex doctor
```

Then start a new Codex thread. If the update contains hook changes, re-run:

```bash
codex debug prompt-input "noop"
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

By default, `quest init` also installs project-scoped native agent templates for
both providers:

- `.codex/agents/quest-executor.toml`
- `.codex/agents/quest-reviewer.toml`
- `.claude/agents/quest-executor.md`
- `.claude/agents/quest-reviewer.md`

Use `quest init --no-agents` when you only want the `.quests/` store. If an
existing project agent template would be replaced, init fails before creating
`.quests/`; inspect the conflicting files, run the explicit provider install
command with `--force` only if you intend to replace them, then rerun
`quest init`.

Project-scoped agent templates install at the Git repository root. For a nested
quest store, run `quest init --no-agents` in the nested directory and set
`QUEST_DIR` for agents launched from elsewhere, or initialize from the repo root.

Work one small quest **in-session** with the skill:

```
$quest:work 12
```

In Claude Code, use the same bundled skills through the `/quest:*` slash-command
form.

…or **headless** with the runner:

```bash
quest-run 12
```

For planned or multi-quest work, prefer orchestration:

```
$quest:orchestrate
```

In Codex, the orchestrator sets a wave-level `create_goal`, then spawns native
`quest-executor` / `quest-reviewer` subagents with their own quest-level goals.
In Claude Code, the same flow uses `/goal` and the same bundled subagents. If a
Codex native subagent surface is unavailable after `tool_search`, or if you
explicitly want headless/background execution, use the fallback with goal mode
required:

```bash
quest-run 12 --worker codex --codex-goal-mode require
```

When a `$quest:plan` result is accepted from Plan Mode, the parent agent
automatically stays the orchestrator: create/lint quest records if needed, set
the wave goal, spawn subagents, verify checkpoints, and rule on reviewer
findings. Product implementation belongs to the spawned executor for each quest,
not to the parent session via `$quest:work`.

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
| `quest init` | Create a quest store (`.quests/`) and install project-scoped Codex/Claude agent templates by default |
| `quest create` | Create a new quest (the only way records are born) |
| `quest list` | List quests (filter by status, parent, or readiness) |
| `quest show` | Show a quest record in full |
| `quest start` | Mark a quest in_progress (todo → in_progress) |
| `quest checkpoint` | Record iteration evidence and drive the quest's status |
| `quest cancel` | Cancel a quest (terminal; reason is recorded) |
| `quest reopen` | Reopen a complete quest back into the loop (complete → in_progress; reason recorded) |
| `quest edit` | Compatibly expand a quest (additions only; anchors are immutable) |
| `quest lint` | Check records against the contract spec |
| `quest amend` | Append a numbered protocol amendment (retro output) |
| `quest protocol` | Print the loop protocol + this store's local amendments |
| `quest runs` | Show headless runner activity (from `.quests/runs.ndjson`) |
| `quest codex` | Validate Codex-native setup and install Codex native agent templates |
| `quest claude` | Validate Claude-native setup and install Claude native agent templates |

## quest-run (headless runner)

`quest-run <id>` drives a worker through the same loop without you in the chair:

- **Workers** — `claude` (`claude -p`) or `codex` (`codex exec`), selected per
  quest. Both use a machine-verifiable Quest checkpoint completion condition;
  Codex goal tools are optional by default and can be required explicitly.
- **Budgets** — deterministic iteration, cost, token, and per-session
  wall-clock (`--session-timeout`, default 1800s) caps; two sessions without a
  new checkpoint (a killed hung session counts as one) auto-writes a `blocked`
  checkpoint and stops.
- **Backends** — drives `local` and `github`-backed stores alike; all record IO
  goes through the `quest` CLI, and the runs journal stays local.
- **`--parallel N`** — with `--ready`, promotes and works newly-ready quests
  across dependency waves, up to N at a time.
- **Epics are never auto-dispatched** — a quest with children stays out of
  `--ready` until every child is terminal, and `quest-run --ready` refuses it
  even then (it logs an "is an epic" skip line). Epics are closed by the
  orchestrator inline per `$quest:orchestrate`, not by burning a worker run on
  pure verification. A direct `quest-run <id>` on an epic still runs, if you
  really mean to.
- **`--notify '<cmd>'`** — runs a templated command on run start/stop so you get
  pinged; notify failures are isolated from the run.
- **`--codex-sandbox <mode>`** — selects the `codex exec` sandbox
  (`read-only` | `workspace-write` | `danger-full-access`; resolved as flag →
  config `defaults.codex.sandbox` → default `workspace-write`). Honest tradeoff:
  the default **`workspace-write` write-protects `.git`, so a codex worker cannot
  `git commit` under it** (the `index.lock` write fails). A quest whose worker
  must commit has to opt into **`danger-full-access`** — which also grants full
  disk and network access. The runner never escalates the sandbox silently; the
  safe `workspace-write` stays the default. (Claude workers ignore this flag.)
- **`--codex-goal-mode <mode>`** — selects how `quest-run` treats Codex goal
  tools (`auto` | `require` | `off`; resolved as flag → config
  `defaults.codex.goal_mode` → default `auto`). `auto` uses the documented
  `codex exec --json --output-schema` stream as the contract and lets Codex use
  goal tools if they are available. `require` blocks honestly if the exec
  surface does not expose or invoke `create_goal`. `off` never asks for goal
  tools.

Inspect activity with `quest runs --active`.

> **Note:** `quest-run` ships with this build's runner milestone (tracked as
> quest 5). On a pre-0.1.0 checkout where `bin/quest-run` isn't present yet, use
> `$quest:work` in-session instead.

## Store backends

- **`local`** (default) — records are markdown files under `.quests/quests/`;
  config, amendments, and the runs journal stay local. Zero dependencies.
- **`github`** (opt-in) — `quest init --backend github --repo owner/name` stores
  records as GitHub Issues via the `gh` CLI (labels mirror status/priority;
  checkpoints become issue comments). Config, amendments, and runs stay local.

```bash
quest init --backend github --repo owner/name
```

The GitHub backend (`quest init --backend github`) and the headless runner
(`quest-run`) work together — `quest-run <id>` drives quests in a github-backed
store exactly as it does locally.

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
