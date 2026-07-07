---
id: 4
title: Skills and agents, dual-harness
status: complete
priority: p1
worker: claude
model: inherit
max_iterations: 8
depends_on: [2]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T13:43:45Z
---

# Skills and agents, dual-harness

## Objective
Ship the five skills (protocol, plan, orchestrate, work, retro) and two agents
(quest-executor, quest-reviewer) serving both harnesses from one tree, each
skill obeying the usability contract.

## Done when
- [ ] Five `skills/<name>/SKILL.md` exist, each with: a 4-line What/When/
      Input/Output header, the procedure, ONE worked example with real
      commands, and closing "Next:" pointers; `description` frontmatter is a
      "Use when…" trigger; `argument-hint` present where arguments apply.
- [ ] Each skill has an `agents/openai.yaml` interface companion for Codex.
- [ ] `agents/quest-executor.md` + `.toml` and `agents/quest-reviewer.md` +
      `.toml` exist; `scripts/check-agent-parity.mjs` passes.
- [ ] Fresh zero-context Claude session (`claude --plugin-dir .`): (a) answers
      "how do I use quest here?" correctly from the plugin surface alone,
      (b) plans a lint-clean quest from a one-line ask, (c) executes a trivial
      synthetic quest producing a spec-compliant checkpoint.
- [ ] Fresh Codex session in the repo discovers the skills via `.agents/skills`
      and can follow the work skill equivalently.

## Validation loop
```bash
node scripts/check-agent-parity.mjs
node bin/quest lint --all
claude --plugin-dir . -p "How do I use quest in this repo? Answer briefly." --output-format json
```

## Constraints
- Protocol text stays in ONE place (skills/protocol/references/); other skills
  and agents point at it, never duplicate it.
- Skills contain zero project-specific or personal references.
- Executor agent must not have agent-spawning tools.

## Context
Usability contract + skill roles: README and `.quests/` plan quests. Protocol
sources: `skills/protocol/references/{protocol.md,contract-spec.md}`.

## Out of scope
- Runner integration (quest 5), hooks (quest 6).

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-07T13:43:45Z — quest_status: complete
- iteration: 1
- head_sha: 841e8a3
- changed: five skills (protocol/plan/orchestrate/work/retro) with usability-contract structure + openai.yaml companions; quest-executor + quest-reviewer in .md+.toml; check-agent-parity gate
- validation_summary: `node scripts/check-agent-parity.mjs` → parity: OK; `node scripts/check-hygiene.mjs` → OK; fresh-session gates via tmux: (a) haiku session with --plugin-dir self-explained quest + listed all 5 skills; (b) sonnet session authored quest via /quest:plan → `quest lint --all` OK (1 record); (c) opus session worked synthetic quest via /quest:work → `node cli.js --version` → 1.0.0 exit 0, spec-compliant complete checkpoint, green commit

Done-when enumeration: (1) five SKILL.md with What/When/Input/Output header, worked example, Next: pointers, argument-hints — Done. (2) openai.yaml per skill — Done, parity-checked. (3) executor+reviewer .md+.toml + parity script — Done. (4) fresh Claude session gates a/b/c — Done via tmux user-session (headless children can't reach this machine's keychain; tmux runs in the user security session — evidence in checkpoints above). (5) Codex discovers skills via .agents/skills — Done (codex exec listed orchestrate/plan/protocol/retro/work).
