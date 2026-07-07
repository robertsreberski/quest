---
id: 4
title: Skills and agents, dual-harness
status: todo
priority: p1
worker: claude
model: inherit
max_iterations: 8
depends_on: [2]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T13:12:31Z
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
