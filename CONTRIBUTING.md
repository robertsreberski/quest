# Contributing to quest

quest is a public, zero-dependency Node ESM project (Node >= 20). There are no
runtime dependencies to install — clone it and you can run everything.

## Dev loop

Test the plugin live in Claude Code by pointing it at your checkout:

```bash
claude --plugin-dir .
```

The skills (`$quest:plan`, `$quest:work`, `$quest:orchestrate`, `$quest:retro`,
`$quest:protocol`, `$quest:setup`) and agents load straight from the working
tree, so edits show up on the next session. Claude Code also exposes the skills
through the `/quest:*` slash-command form.

Before opening a PR, run the same gates CI runs:

```bash
npm test                          # node --test over tests/
node scripts/check-hygiene.mjs    # shipped content stays project-agnostic
npm run check:manifests           # both plugin manifests: valid JSON + fields
npm run check:parity              # agent / skill parity
```

CI (`.github/workflows/ci.yml`) runs these on Node 20 and 24 for every push to
`main` and every pull request, plus `shellcheck` if any `*.sh` scripts exist. No
secrets are required for the default gates.

### Hygiene

Shipped content must be **project-agnostic**: no personal filesystem paths and
no references to the private projects this methodology was extracted from.
`scripts/check-hygiene.mjs` enforces this and runs in CI — keep new docs and
code clean of machine-specific paths.

## Repo layout

```
bin/       Executables — the `quest` and `quest-run` entry points
lib/       CLI implementation (contract, store, config, help, CLI dispatch)
skills/    Plugin skills + protocol/record-format references
agents/    The quest-executor and quest-reviewer subagent definitions
scripts/   CI gates (hygiene, manifest validation, agent/skill parity)
schemas/   JSON schemas (e.g. the headless worker final-report schema)
tests/     node --test suites + snapshots
.quests/   This repo's own quest store (see "Dogfooding" below)
```

Dual plugin manifests live at `.claude-plugin/plugin.json` +
`.claude-plugin/marketplace.json` (Claude Code) and `.codex-plugin/plugin.json`
(Codex).

## Quest records are CLI-only

Quest records under `.quests/quests/` are written **exclusively** through the
`quest` CLI (`quest create`, `quest start`, `quest checkpoint`, `quest edit`,
`quest cancel`). Never hand-edit a record file: the CLI is the single write path
that keeps records conformant to the contract spec
(`skills/protocol/references/contract-spec.md`), and hand edits fail `quest
lint`. The same rule holds in CI and in every worker.

## Dogfooding

quest builds itself with its own protocol. This repo's roadmap lives in
`.quests/` as quest records, and work on the repo follows the quest loop:
orient on the record, implement one milestone, run the Validation loop, commit
green, and record a checkpoint. When you pick up work, start from a quest —
`quest list --ready` shows what's dispatchable — and leave a checkpoint trail a
fresh session can resume from.

## Release steps

1. Bump the version in **both** plugin manifests and `package.json`:
   - `.claude-plugin/plugin.json`
   - `.codex-plugin/plugin.json`
   - `package.json`
2. Add a `CHANGELOG.md` entry under a new version heading (move items out of
   `## [Unreleased]`).
3. Verify green: `npm test && node scripts/check-hygiene.mjs && npm run
   check:manifests && npm run check:parity`.
4. Commit, then tag and push:

   ```bash
   git tag vX.Y.Z
   git push origin main --tags
   ```

quest is distributed as a plugin and an npm CLI package. Publish the package
only when the CLI surface changed; the tag updates plugin marketplace installs.
