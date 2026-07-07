---
id: 10
title: Secret scanning via gitleaks in CI
status: in_progress
priority: p1
worker: claude
model: inherit
max_iterations: 8
created: 2026-07-07T14:10:31Z
updated: 2026-07-07T14:10:31Z
---

# Secret scanning via gitleaks in CI

## Objective
CI scans the full git history for leaked secrets using the mainstream open-source checker (gitleaks) on every push and PR.

## Done when
- [ ] ci.yml has a dedicated secrets job running gitleaks/gitleaks-action@v2 with fetch-depth 0
- [ ] a green run of the secrets job exists on GitHub

## Validation loop
```bash
gh run list --limit 1
```

## Constraints
- no paid license requirements (personal-account action usage only); no new npm dependencies

## Context
CI workflow: .github/workflows/ci.yml (test job exists); gitleaks-action requires GITHUB_TOKEN env which Actions provides automatically

## Checkpoints
