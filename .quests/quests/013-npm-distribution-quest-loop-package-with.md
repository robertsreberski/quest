---
id: 13
title: npm distribution: quest-loop package with global quest and quest-run bins
status: in_progress
priority: p1
worker: claude
model: inherit
max_iterations: 8
created: 2026-07-07T18:42:39Z
updated: 2026-07-07T18:42:39Z
---

# npm distribution: quest-loop package with global quest and quest-run bins

## Objective
quest installs globally via npm (npm i -g quest-loop) putting quest and quest-run on PATH everywhere, independent of any harness plugin.

## Done when
- [ ] package.json publishes as quest-loop with bin entries for quest and quest-run, a files whitelist, and publishConfig pinning registry.npmjs.org
- [ ] `npm pack` tarball installs globally and a clean shell resolves quest + quest-run; `quest protocol` works from the global install (protocol references included in the package)
- [ ] package published: `npm view quest-loop version` returns 0.1.0; README documents npm install

## Validation loop
```bash
npm test && npm pack --dry-run
```

## Constraints
- no code changes beyond packaging metadata and README; .quests/, tests/, .github/ excluded from the tarball

## Context
Names quest/quest-cli taken on npm; quest-loop free. Local npm token is E401 — publish step needs owner login (npm login --registry https://registry.npmjs.org/). Machine gotcha: default registry is proxied, always pass/pin the public registry for writes. quest protocol resolves ../skills/protocol/references relative to bin — files list must include skills/

## Checkpoints
