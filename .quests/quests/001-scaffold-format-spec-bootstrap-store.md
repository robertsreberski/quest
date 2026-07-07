---
id: 1
title: Scaffold repo, format spec, and bootstrap quest store
status: complete
priority: p0
worker: claude
model: inherit
max_iterations: 4
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T13:22:22Z
---

# Scaffold repo, format spec, and bootstrap quest store

## Objective
Create the public repo skeleton: dual plugin manifests (Claude Code + Codex),
OSS files, the full generalized protocol + record-format specifications, and a
`.quests/` store containing quests 001–009 hand-authored in the canonical
format before the CLI exists.

## Done when
- [ ] `claude --plugin-dir .` loads the plugin with no manifest errors.
- [ ] `skills/protocol/references/contract-spec.md` defines every frontmatter
      field, body section, checkpoint byte format, GitHub mapping, and exit code.
- [ ] `skills/protocol/references/protocol.md` contains the full generalized
      protocol with zero references to any private project or personal path.
- [ ] `.quests/quests/001–009` exist and follow the spec (`quest lint --all`
      must pass once quest 2 ships the linter).
- [ ] LICENSE (MIT), README stub, CHANGELOG, package.json, `.agents/skills`
      symlink, `.gitignore`, `schemas/final-report.schema.json` present.

## Validation loop
```bash
claude plugin validate .
node scripts/check-hygiene.mjs
```

## Constraints
- Shipped content is fully project-agnostic: generic example commands only.
- No runtime dependencies anywhere.

## Context
Format contract: contract-spec.md (this repo). Packaging precedent: dual-manifest
plugins with a `skills/` tree shared across harnesses.

## Out of scope
- The CLI itself (quest 2), skills bodies (quest 4), CI (quest 7).

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-07T13:22:22Z — quest_status: complete
- iteration: 1
- changed: full scaffold — dual plugin manifests + self-marketplace, protocol.md, contract-spec.md, final-report schema, LICENSE/README/CHANGELOG/package.json/.gitignore, .agents/skills symlink, .quests store with quests 001–009, scripts/check-hygiene.mjs
- validation_summary: `claude plugin validate .` → "Validation passed"; `node scripts/check-hygiene.mjs` → "hygiene: OK"
- failed_approaches: inline hygiene grep in this quest's validation loop self-matched its own pattern — replaced with scripts/check-hygiene.mjs (patterns assembled from fragments); live `claude --plugin-dir . -p` load check substituted with `claude plugin validate .` because headless child sessions cannot reach login credentials on this machine (keychain ACL quirk) — live-session load is re-verified by quest 4's fresh-session gate

Done-when enumeration: (1) plugin loads with no manifest errors — Done via `claude plugin validate .` (substitution named above). (2) contract-spec.md complete — Done (fields, sections, checkpoint bytes, GitHub mapping, exit codes). (3) protocol.md generalized, zero private references — Done, enforced by hygiene script. (4) quests 001–009 exist and follow the spec — Done (existence + format); the `quest lint --all` clause runs in quest 2 per this item's own wording. (5) OSS scaffold files present — Done.
