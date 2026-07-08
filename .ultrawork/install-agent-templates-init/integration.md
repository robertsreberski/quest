# Integration: install-agent-templates-init

## Implemented

- Shared native agent installer supports Codex `.toml` and Claude `.md` templates.
- `quest init` installs project-scoped Codex and Claude templates by default, with `--no-agents` opt-out and conflict preflight before `.quests/` creation.
- Added `quest claude install-agents` and `quest claude doctor`.
- Installer refuses symlinked provider/agents dirs or template files, including under `--force`.
- Docs, setup skill, changelog, snapshots, and tests were updated.

## Review Disposition

- Accepted and fixed shim fidelity, Claude atomicity coverage, no-agent assertions, conflict recovery docs, nested-store guidance, and symlink overwrite protection.
- Rejected provider-doctor manifest coupling as intentional global release parity: `version-sync` has historically checked all present Quest manifests, and `check:manifests` treats them as one release unit.

## Verification

- `node --test tests/cli.test.mjs` passed after review fixes.
- `npm test` passed: 128 tests.
- `npm run check:parity` passed.
- `npm run check:hygiene` passed.
- `npm run check:manifests` passed.
- `npm pack --dry-run` passed and included `agents/`.
- `git diff --check` passed.
- `codex debug prompt-input "noop"` exited 0. The host still exposes both checkout and installed-cache Quest skill roots in prompt input; no hook parser failure was observed.
