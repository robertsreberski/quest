---
id: 3
title: GitHub Issues backend via gh
status: complete
priority: p1
worker: claude
model: inherit
max_iterations: 8
depends_on: [2]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T14:04:03Z
---

# GitHub Issues backend via gh

## Objective
Implement the GitHub backend (`lib/store-github.mjs`) so every quest command
works identically against GitHub Issues through the `gh` CLI, per the mapping
table in contract-spec.

## Done when
- [ ] Full mapping implemented: body sections, `<!-- quest:meta -->` block,
      status/priority labels (auto-created by `init`), checkpoint comments,
      epic `## Children` task lists, issue-state mirroring.
- [ ] Lifecycle round-trip test green against a fake `gh` PATH shim.
- [ ] Live smoke against a scratch repo: `quest show <id> --json` returns the
      SAME shape as the local backend for an equivalent record.
- [ ] Fail-honest: missing/unauthenticated `gh` and any `gh` failure exit 6
      surfacing gh's stderr; no silent fallback to local (asserted in tests).

## Validation loop
```bash
node --test tests/store-github.test.mjs
node --test tests/
```

## Constraints
- Pure `gh` invocations — no direct GitHub API client, no tokens handled here.
- Config, amendments, and the runs journal stay local in `.quests/`.
- Checkpoint bytes identical across backends.

## Context
Mapping table: `skills/protocol/references/contract-spec.md` ("GitHub backend
mapping"). Store seam: `lib/store-local.mjs` from quest 2 defines the interface.

## Out of scope
- GitHub sub-issues GraphQL API; GitHub milestones.

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-07T14:04:03Z — quest_status: complete
- iteration: 1
- changed: Added lib/store-github.mjs (gh-only GitHub Issues backend) + lib/store.mjs seam; cli.mjs now backend-agnostic (both BackendError placeholder throws removed, GhError→exit 6 wired); shared body helpers moved to contract.mjs; tests/shims/gh + tests/store-github.test.mjs; live smoke parity green.
- validation_summary: `node --test tests/store-github.test.mjs` → 7 pass/0 fail; `node --test tests/*.test.mjs` → 70 pass/0 fail; live on robertsreberski/quest-scratch-g3: `quest show 1 --json` vs equivalent local → keys identical, stable fields identical, 2 checkpoints structurally equal, ts-masked body byte-identical; raw issue CLOSED/COMPLETED, labels [quest,quest:complete,quest-p1], 2 checkpoint-marker comments.
- failed_approaches: gh auth status (no host) exits 1 on an unrelated github.a8c.com timeout → scoped assertAuth to `--hostname github.com`; gh issue list --label has a brief post-create indexing lag while gh issue view is immediately consistent (transient, GitHub-side, not a code bug).

Done-when enumeration:
1. Full mapping implemented — DONE: <!-- quest:meta --> block at body top (status/priority excluded, in labels); body = sections minus ## Checkpoints; labels marker quest + quest:todo|in-progress|blocked|complete|cancelled (hyphen in in-progress label vs underscore in status) + quest-p0|p1|p2 (auto-created idempotently by init via gh label create --force); checkpoints = issue comments reusing makeCheckpoint bytes; epic ## Children task list (- [ ] #N, created if absent) + child meta parent:N; issue-state mirrored (complete→close --reason completed, cancelled→close --reason 'not planned', reopen on blocked/in_progress if closed). Verified live: issue CLOSED/COMPLETED with quest:complete label.
2. Lifecycle round-trip test vs fake gh PATH shim — DONE: tests/shims/gh (executable ESM node script, state in $GH_SHIM_STATE) + tests/store-github.test.mjs drive full create→start→checkpoint→complete through run() from lib/cli.mjs; 7/7 pass.
3. Live smoke: show --json SAME shape as local — DONE: init/create/start/checkpoint x2/list/lint/show against real gh on private robertsreberski/quest-scratch-g3; keys identical, id/title/status/priority/worker/model/max_iterations identical, checkpoints[] structurally equal, ts-masked body byte-identical.
4. Fail-honest exit 6, no local fallback — DONE: every gh call via execFileSync with stderr captured→GhError(stderr)→exit 6; missing gh (ENOENT) → exit 6 with install hint; gh auth failure → exit 6 surfacing stderr; asserted by 'missing gh exits 6 and never falls back to local' and 'gh auth failure exits 6' tests. No path from github→local anywhere.
Deviations: (a) updated the pre-existing cli.test 'github backend is honestly unavailable' test to assert the new real fail-honest behavior (exit 6 via missing gh) since the quest mandates removing the placeholder it asserted; (b) scratch repo NOT deleted — token scopes are gist/read:org/repo/workflow, deletion needs delete_repo (HTTP 403); left robertsreberski/quest-scratch-g3 in place as instructed; (c) config/amend/runs/protocol stay local for both backends.
