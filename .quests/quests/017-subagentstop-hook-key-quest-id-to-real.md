---
id: 17
title: SubagentStop hook: key quest id to real invocations, not transcript prose
status: todo
priority: p1
worker: claude
model: opus
effort: xhigh
max_iterations: 8
created: 2026-07-07T21:32:34Z
updated: 2026-07-07T21:32:34Z
---

# SubagentStop hook: key quest id to real invocations, not transcript prose

## Objective
Fix hooks/subagent-stop.mjs so the quest-executor detection marker only matches actual command invocations in the transcript JSONL, never skill text, examples, or file contents echoed into the transcript.

## Done when
- [ ] the hook derives the quest id from tool-use invocation entries in the transcript JSONL (parsed per-entry), not from a raw-text regex over the whole file; prose like the `quest show 12 --json` examples in skills/work/SKILL.md:60 and skills/orchestrate/SKILL.md:88 can no longer key the detection
- [ ] a regression test reproduces the quest 15 executor false positive: a synthetic transcript whose first raw-text marker match is a skill-text example (quest 12) but whose real invocations target another quest id is keyed to the real id
- [ ] multiple real quest show invocations resolve deterministically and documented (e.g. first real invocation wins), and the conservative-allow behavior for missing/unreadable/unparseable input is preserved with existing tests still green
- [ ] `npm test` passes including new tests in tests/hooks.test.mjs

## Validation loop
```bash
npm test
```

## Constraints
- do not change the skill/agent example text to dodge the bug — fix the detection
- keep the hook zero-dependency and conservative: any ambiguity resolves to allow

## Context
Evidence: quest 15 executor (2026-07-07T21:20Z) recorded its checkpoint on quest 15 but was blocked at stop with a demand to checkpoint quest 12 — MARKER regex in hooks/subagent-stop.mjs (~line 25) takes the FIRST raw-text match in the transcript, and the /quest:work skill text containing quest show 12 --json enters the transcript before the executor real orientation call. Quest 12 is long-terminal so neither clear condition fired. The hook header comment claims "We never false-positive-block unrelated subagents" — currently false.

## Checkpoints
