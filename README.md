# quest

Goal-loop engineering for coding agents.

quest turns asks into **evidence-checkable contracts** ("quests"), executes
them in **iterative loops that end in verifiable checkpoints**, orchestrates
**Claude and Codex workers** (in-session or headless, serial or parallel), and
mines retrospectives into **numbered protocol amendments** your future sessions
actually read.

It is a single plugin serving both harnesses, plus a zero-dependency CLI:

- `quest` — the quest store: contracts, checkpoints, wave scheduling. Local
  markdown files by default; GitHub Issues opt-in.
- `quest-run` — the headless runner: drives `claude -p` or `codex exec`
  workers in native goal mode with deterministic budgets and notifications.
- Five skills — `/quest:plan`, `/quest:work`, `/quest:orchestrate`,
  `/quest:retro`, `/quest:protocol`.
- Two agents — `quest-executor`, `quest-reviewer`.

> **Status: pre-release scaffold.** The full quickstart lands with v0.1.0.
> The build of quest is itself tracked as quests — see [`.quests/`](./.quests/).

## The idea in 30 seconds

```
you:    /quest:plan add dark mode to the settings page
agent:  creates quest 12 — Objective, Done-when, Validation loop… (quest create)
you:    /quest:orchestrate
agent:  dispatches a worker on quest 12; it iterates: milestone → validate →
        commit → checkpoint. You review evidence, not vibes.
```

Every quest ends in a checkpoint trail a fresh session can resume from — that
is the whole trick.

## License

MIT
