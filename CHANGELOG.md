# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

### Changed
- Wave composition now treats epics (parent quests) as orchestrator-closed, not
  worker-dispatched. `quest list --ready` excludes any quest with a non-terminal
  child (a child in complete or cancelled is terminal, so a cancelled child no
  longer wedges its epic), in both the local and GitHub backends. `quest-run
  --ready` additionally refuses to auto-dispatch a quest that has children even
  once they are all terminal, logging an actionable "is an epic — close it inline
  per /quest:orchestrate" line; a direct `quest-run <id>` on an epic stays
  allowed. The orchestrate skill gains a "Closing an epic" procedure and the plan
  skill documents that epic contracts are integration-level only.

### Fixed
- SubagentStop hook now keys quest-executor detection to real *mutating*
  invocations — `quest start <id>` or `quest checkpoint <id>` (under any binary
  prefix: `quest`, `./bin/quest`, `node bin/quest`) — instead of the read-only
  `quest show <id> --json` orientation call. Reviewers and orchestrators that run
  only read verbs (show / list / protocol / runs) never owned a quest, so they are
  allowed silently; this removes a false positive where a read-only quest-reviewer
  was blocked at stop for merely inspecting a terminal quest. A `quest checkpoint`
  invocation counts too, so an executor resuming an already-in_progress quest
  (which skips `quest start`) is still detected. The first mutating invocation wins
  (deterministic); the executor block, per-entry parsing that keeps skill-text
  examples from keying detection, and conservative allow-on-ambiguity are all
  preserved.
- SubagentStop hook now derives the quest-executor id by parsing the transcript
  JSONL per-entry and matching its marker only inside real tool_use command
  invocations — never prose, examples, or echoed file contents. This removes a
  false positive where skill-text examples keyed the detection ahead of the
  executor's real call. The first real invocation wins (deterministic);
  conservative allow-on-ambiguity is preserved.

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
