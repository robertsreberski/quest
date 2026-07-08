---
name: setup
description: Use when setting up, validating, updating, or troubleshooting Quest's native Codex plugin integration.
argument-hint: "[doctor|install-agents]"
---

# Set up Quest for Codex

Use this for Codex integration work, not for ordinary quest execution.

## Doctor

Check the installed Codex-facing state from the actual Codex surfaces:

```bash
quest codex doctor
```

This verifies the Codex CLI, installed `quest@quest` plugin version, hook parser
health, neutral-directory skill roots, and whether `quest-executor` plus
`quest-reviewer` are available as native Codex custom agents.

## Install Native Agents

Install the custom agents for this repository:

```bash
quest codex install-agents --scope project
```

Use user scope only when you want the agents available everywhere:

```bash
quest codex install-agents --scope user
```

If an existing file conflicts, inspect it first. Use `--force` only when you
intend to replace that custom agent with Quest's bundled definition.

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
