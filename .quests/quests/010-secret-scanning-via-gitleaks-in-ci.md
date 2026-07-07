---
id: 10
title: Secret scanning via gitleaks in CI
status: complete
priority: p1
worker: claude
model: inherit
max_iterations: 8
created: 2026-07-07T14:10:31Z
updated: 2026-07-07T14:11:56Z
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

<!-- quest:checkpoint -->
### 2026-07-07T14:11:56Z — quest_status: complete
- iteration: 1
- changed: dedicated secrets job (gitleaks/gitleaks-action@v2, fetch-depth 0) added to ci.yml; full local history pre-scan clean
- validation_summary: `gitleaks git --no-banner --redact` → 10 commits scanned, no leaks found; `gh run list --limit 1` → success (https://github.com/robertsreberski/quest/actions/runs/28872835972) with the secrets job green

Done-when enumeration: (1) secrets job with gitleaks-action@v2 + fetch-depth 0 — Done. (2) green secrets-job run on GitHub — Done (https://github.com/robertsreberski/quest/actions/runs/28872835972). Constraint held: only the auto-provided GITHUB_TOKEN, no license key (personal account), no npm deps.
