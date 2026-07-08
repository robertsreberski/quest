# Review: install-agent-templates-init

Reviewed the working tree diff for init-installed native agent templates and Claude setup parity.

## Findings

- Accepted: Claude shim fidelity. The test shim now emits the real `id: "quest@quest"` plugin-list shape.
- Accepted: Claude atomicity coverage. Added mixed create+conflict tests and init no-partial-write assertions.
- Accepted: `init --no-agents` coverage. Added absence assertions for both executor and reviewer templates for both providers.
- Accepted: conflict recovery docs. Docs now say to force-install only after inspection, then rerun `quest init`.
- Accepted: nested store caveat. Docs now explain project templates install at the Git repo root and mention `QUEST_DIR` for nested stores.
- Accepted: symlink overwrite guard. Installer now refuses symlinked provider/agents dirs and agent files, including under `--force`.
- Rejected: cross-provider manifest parity in doctor. The global `version-sync` check predates this change for Codex and is intentional release hygiene because Quest manifests ship as one release unit.

## Verification

- `node --test tests/cli.test.mjs` passed after fixes.
- Full project verification is recorded in the final integration notes.
