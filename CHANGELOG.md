# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

### Fixed
- SubagentStop hook now derives the quest-executor id by parsing the transcript
  JSONL per-entry and matching the `quest show <id> --json` marker only inside
  real tool_use command invocations — never prose, examples, or echoed file
  contents. This removes a false positive where skill-text examples (e.g.
  `quest show 12 --json`) keyed the detection ahead of the executor's real
  orientation call. The first real invocation wins (deterministic); conservative
  allow-on-ambiguity is preserved.

## [0.1.1] — 2026-07-07

### Fixed
- Codex plugin hook config now uses the strict top-level `hooks` schema that
  Codex accepts, removing the startup parse warning caused by an extra
  `description` field.

### Changed
- Manifest validation now checks `hooks/hooks.json` for Codex-compatible
  top-level fields before packaging or release.

## [0.1.0] — 2026-07-07

First public release. The build of this release was itself executed as quests
1–12 in [`.quests/`](./.quests/) — contracts, checkpoints, an adversarial
review round, and a retro with five protocol amendments.

### Added
- `quest` CLI — the quest store: contracts with Objective / Done-when /
  Validation-loop anchors, evidence-citing checkpoints, wave scheduling
  (`list --ready`), compatible-expansion edits, lint, protocol + amendments.
  Zero dependencies; strict fail-honest parsing; guided help on every command.
- Two store backends: local markdown (default) and GitHub Issues via `gh`
  (labels mirror status/priority, checkpoints are issue comments, identical
  bytes across backends).
- `quest-run` — headless runner driving **Claude** (`claude -p`, native `/goal`
  mode) and **Codex** (`codex exec`, goal-tools prompt + corrective/continuation
  resume) workers; deterministic budgets (sessions, cost, tokens), wall-clock
  session timeout, stall enforcement, runs journal, `--notify`, `--parallel`
  with optional worktree isolation, configurable codex sandbox mode.
- Five skills (`/quest:plan`, `/quest:work`, `/quest:orchestrate`,
  `/quest:retro`, `/quest:protocol`) and two agents (`quest-executor`,
  `quest-reviewer`), served to both harnesses from one tree.
- Hooks: SessionStart in-flight summary; SubagentStop checkpoint enforcement.
- CI: tests (Node 20/24), hygiene, manifest validation, agent/skill parity,
  gitleaks secret scan.
- Repository scaffold: dual plugin manifests (Claude Code + Codex), protocol
  and record-format specifications, bootstrap quest store tracking this
  project's own build.
