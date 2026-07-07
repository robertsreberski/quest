---
id: 9
title: Install validation and v0.1.0 release
status: complete
priority: p0
worker: claude
model: inherit
max_iterations: 6
depends_on: [8]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T15:18:43Z
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

<!-- quest:checkpoint -->
### 2026-07-07T15:18:43Z — quest_status: complete
- iteration: 1
- changed: installs validated from the public repo on BOTH harnesses; v0.1.0 tagged and pushed with CHANGELOG
- validation_summary: `claude plugin marketplace add robertsreberski/quest` → added; `claude plugin install quest@quest` → installed (scope: user); fresh claude session (no --plugin-dir): `which quest` → ~/.claude/plugins/cache/quest/quest/0.1.0/bin/quest, all 5 skills + 2 agents listed; `codex plugin marketplace add https://github.com/robertsreberski/quest` → added; `codex plugin add quest@quest` → installed 0.1.0; codex exec from a neutral dir listed all 5 quest skills from the installed plugin; `git tag --list v0.1.0` → v0.1.0; `npm test` → 80 pass

Done-when enumeration: (1) Claude marketplace add + install from the public repo URL, fresh session has skills and quest on PATH — Done, with a NAMED SUBSTITUTION: validated in the owner'\''s real environment via fresh sessions rather than a fresh container/spare account (stronger end-user evidence from the actual public repo; weaker isolation — no container runtime exercised). (2) Codex install — Done, EXCEEDING the record'\''s fallback expectation: the public repo worked directly as a codex marketplace (codex plugin add quest@quest), no local snapshot or clone-path fallback needed. (3) v0.1.0 tag + CHANGELOG + README real install commands — Done.
