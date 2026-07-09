# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [0.3.6] — 2026-07-09

### Added
- `quest list --queue` now exposes worker-ready quests, inline-close-ready epics,
  and blocked queue reasons as separate orchestration queues.
- `quest lint --all` now reports missing parent and `depends_on` references
  across local and GitHub-backed stores.
- Provider `work --dry-run` commands now print native subagent handoffs or the
  `quest-run` fallback command after running setup health checks.

### Changed
- Session-start status output and command help are more concise and focused on
  the next operator action.
- `$quest:plan` and `$quest:orchestrate` now document the v2 queue workflow and
  explicit provider/model/effort handoffs more precisely.

### Fixed
- Malformed hand-edited `depends_on` metadata now stays a normal contract or
  queue-blocking problem instead of crashing graph lint or entering
  `worker_ready`.
- Headless Codex fallback handoff commands now quote Quest binary paths that
  contain spaces.

## [0.3.5] — 2026-07-08

### Added
- `quest codex doctor --fix` and `quest claude doctor --fix` now repair
  Quest-owned native-agent templates and provider plugin install/version state,
  then rerun the same doctor checks.
- `quest codex open` and `quest claude open` now run the provider health gate
  before launching the interactive provider from the project root.

### Changed
- Stale Quest agent templates are replaced without `--force`; unrelated custom
  files still require explicit replacement.

## [0.3.4] — 2026-07-08

### Changed
- `quest codex install-agents` and `quest claude install-agents` now allow
  `--force` to write through symlinked agent template files, while continuing to
  refuse symlinked provider agent directories.

### Added
- Added a Quest plan-exit reminder hook that nudges accepted `$quest:plan`
  handoffs toward `$quest:orchestrate` rather than direct implementation.

## [0.3.3] — 2026-07-08

### Changed
- `$quest:plan` now makes the planning parent session adopt
  `$quest:orchestrate` by default after creating and linting quests, stopping
  before dispatch only when the user explicitly asks for create-only or
  no-dispatch behavior.

## [0.3.2] — 2026-07-08

### Added
- Added Claude setup parity: `quest claude install-agents --scope project` and
  `quest claude doctor` now mirror the existing Codex setup flow.

### Changed
- `quest init` now installs project-scoped Codex and Claude native agent
  templates by default, `--no-agents` skips that install, and conflicting
  project templates fail init before `.quests/` is created unless users
  intentionally rerun the explicit provider install command with `--force`.
- `$quest:orchestrate` now states that Codex native subagents are the default
  dispatch path for serial and parallel waves; `quest-run` is fallback-only
  unless headless/background execution is explicitly requested.
- `$quest:plan` now routes accepted Plan Mode implementation requests straight
  to the orchestrator role instead of leaving room for parent-session
  `$quest:work` execution.

### Fixed
- `quest codex doctor` now fails on stale `quest` binaries on PATH, stale
  installed Codex plugin versions, and duplicate Quest skill roots in
  `codex debug prompt-input "noop"` output.

## [0.3.1] — 2026-07-08

### Changed
- `$quest:orchestrate` now documents Codex/Claude native subagent parity:
  orchestrator-level goals, goal-mode executor/reviewer dispatch prompts, and
  `quest-run --codex-goal-mode require` as the Codex headless fallback.
- `$quest:plan` now makes the accepted Plan Mode handoff explicit: the parent
  session becomes the orchestrator and spawned quest executors implement the
  code.
- `$quest:plan` now requires generated `quest create` commands to specify
  `--worker`, `--model`, and `--effort` explicitly, and asks the user before
  entering `$quest:orchestrate`.
- `quest codex doctor` now checks Codex `multi_agent` feature availability and
  describes native-agent checks as installed template parity.
- Wave-level orchestrator goals now treat `cancelled` quests as terminal
  alongside `complete` and `blocked` store statuses.

### Fixed
- `quest codex doctor` now checks Codex `goals` feature availability, so a
  setup with `multi_agent=true` but goal tools disabled fails readiness instead
  of green-lighting native goal-mode dispatch.

## [0.3.0] — 2026-07-08

### Added
- `$quest:setup` skill plus `quest codex doctor` for native Codex validation:
  checks Codex CLI availability, installed `quest@quest` version, hook parser
  health, neutral-directory Quest skill roots, and native `quest-executor` /
  `quest-reviewer` custom-agent availability.
- `quest codex install-agents --scope project|user` installs Quest's bundled
  agent TOML files into Codex's native `.codex/agents` or `~/.codex/agents`
  locations. The command is idempotent, supports `--dry-run`, and requires
  `--force` before replacing different existing agent files.
- `quest --version` reports the package version.
- `quest-run --codex-goal-mode auto|require|off` controls how headless Codex
  runs treat goal tools. `auto` is the default and uses documented
  `codex exec --json --output-schema` output as the contract; `require` blocks
  honestly when `create_goal` is not observed; `off` avoids goal-tool prompts.

### Changed
- Codex is now the first-class plugin path in docs and skill UI metadata:
  examples use `$quest:*`, the Codex setup flow runs `quest codex doctor`, and
  `package.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json`
  now share the same version.
- `codex exec resume` invocations no longer pass unsupported `-C`; the runner
  relies on the child process working directory and original Codex session.
- Bundled hooks now prefer `CODEX_PLUGIN_ROOT` with a `CLAUDE_PLUGIN_ROOT`
  fallback, include a `resume` SessionStart matcher, status messages, timeouts,
  and Windows command variants.

### Fixed
- SubagentStop hook now recognizes Codex JSONL `command_execution` entries in
  addition to Claude-style `tool_use.input.command` blocks, while preserving the
  mutating-verb-only detection rule.

## [0.2.0] — 2026-07-08

### Added
- `quest reopen <id> --reason <why>` — the audited exit from `complete`. Flips a
  completed quest back to `in_progress` on both backends, recording the reason in
  a real checkpoint via the new optional `reopen_reason` field; the GitHub backend
  reopens the mirrored issue and swaps `quest:complete → quest:in-progress`.
  `TRANSITIONS.complete` stays empty — a checkpoint can never resurrect a complete
  quest; only the explicit verb can, and `cancelled` remains fully terminal.
  Reopening a child of a complete parent epic warns on stderr that the epic's
  verdict may be falsified. Reopened quests do not re-enter `quest list --ready`;
  they are dispatched directly by id. `quest edit` on a complete or cancelled
  quest now errors with a reopen-first / file-a-new-quest hint, and `quest-run`
  on an already-complete quest suggests the verb instead of silently no-opping.

### Changed
- Wave composition now treats epics (parent quests) as orchestrator-closed, not
  worker-dispatched. `quest list --ready` excludes any quest with a non-terminal
  child (a child in complete or cancelled is terminal, so a cancelled child no
  longer wedges its epic), in both the local and GitHub backends. `quest-run
  --ready` additionally refuses to auto-dispatch a quest that has children even
  once they are all terminal, logging an actionable "is an epic — close it inline
  per $quest:orchestrate" line; a direct `quest-run <id>` on an epic stays
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
