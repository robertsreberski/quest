---
id: 9
title: Install validation and v0.1.0 release
status: todo
priority: p0
worker: claude
model: inherit
max_iterations: 6
depends_on: [8]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T13:12:31Z
---

# Install validation and v0.1.0 release

## Objective
Validate real installation on both harnesses from a clean environment and cut
the public v0.1.0 release.

## Done when
- [ ] Clean environment (fresh container or spare account): Claude Code
      marketplace add + plugin install from the public repo URL succeeds; a
      fresh session has the `/quest:*` skills available and `quest` on PATH.
- [ ] Codex: plugin install validated against a local marketplace snapshot of
      this repo, or the `.agents/skills` clone path documented honestly in the
      README if public listing requires upstream approval.
- [ ] `v0.1.0` tag pushed with a CHANGELOG entry; README shows the real
      install commands.

## Validation loop
```bash
git tag --list v0.1.0
npm test
```

## Constraints
- Install transcripts captured as evidence in the checkpoint.
- No fabricated install claims — each step actually run in a clean env.

## Context
Manifests: `.claude-plugin/`, `.codex-plugin/`. Marketplace file:
`.claude-plugin/marketplace.json`.

## Out of scope
- Post-release feature work.

## Checkpoints
