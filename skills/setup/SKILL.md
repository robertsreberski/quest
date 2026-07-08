---
name: setup
description: Use when setting up, validating, updating, or troubleshooting Quest's native Codex or Claude plugin integration.
argument-hint: "[doctor|install-agents|init]"
---

# Set up Quest native agents

Use this for Codex or Claude integration work, not for ordinary quest execution.

## Project Init

`quest init` creates `.quests/` and, by default, installs project-scoped native
agent templates for both providers:

- `.codex/agents/quest-executor.toml`
- `.codex/agents/quest-reviewer.toml`
- `.claude/agents/quest-executor.md`
- `.claude/agents/quest-reviewer.md`

Use `quest init --no-agents` when you only want the quest store. If an existing
project template conflicts, init fails before creating `.quests/`; inspect the
file, run the explicit provider install command with `--force` only when you
intend replacement, then rerun `quest init`.

Project-scoped agent templates install at the Git repository root. For a nested
quest store, use `quest init --no-agents` in the nested directory and set
`QUEST_DIR` for agents launched from elsewhere, or initialize from the repo root.

## Doctor

Check the installed Codex-facing state from the actual Codex surfaces:

```bash
quest codex doctor
```

This verifies the Codex CLI, `quest` binary on PATH, `multi_agent` and `goals`
feature flags, installed `quest@quest` plugin version, hook parser health,
duplicate/stale Quest skill roots, and whether the `quest-executor` plus
`quest-reviewer` native-agent templates are installed and current. Runtime
dispatch still happens from the parent Codex session via native subagent tools;
use `quest-run --codex-goal-mode require` only as the headless fallback.

Check the installed Claude-facing state from the actual Claude surfaces:

```bash
quest claude doctor
```

## Install Native Agents

Install the Codex custom agents for this repository:

```bash
quest codex install-agents --scope project
```

Install the Claude custom agents for this repository:

```bash
quest claude install-agents --scope project
```

Use user scope only when you want the agents available everywhere:

```bash
quest codex install-agents --scope user
quest claude install-agents --scope user
```

If an existing file conflicts, inspect it first. Use `--force` only when you
intend to replace that custom agent with Quest's bundled definition. Symlinked
agent directories or files are refused rather than overwritten.

## Update Installed Plugin

Codex installs from marketplace snapshots. After updating or releasing Quest,
refresh and reinstall, then start a new Codex thread:

```bash
codex plugin marketplace upgrade quest
codex plugin add quest@quest
quest codex doctor
```

If hooks changed, review/trust the updated hook definitions in Codex when
prompted, then re-run:

```bash
codex debug prompt-input "noop"
```
