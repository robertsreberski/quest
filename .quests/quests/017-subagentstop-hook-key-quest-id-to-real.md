---
id: 17
title: SubagentStop hook: key quest id to real invocations, not transcript prose
status: complete
priority: p1
worker: claude
model: opus
effort: xhigh
max_iterations: 8
created: 2026-07-07T21:32:34Z
updated: 2026-07-07T21:37:24Z
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

<!-- quest:checkpoint -->
### 2026-07-07T21:37:24Z — quest_status: complete
- iteration: 1
- changed: Fixed SubagentStop false positive: quest id now derived per-entry from real tool_use command invocations, not a raw-text regex over the whole transcript. Added executorQuestId/markerIdInEntry/commandOf helpers in hooks/subagent-stop.mjs; only a tool_use block's input.command is scanned (never text blocks, tool_result echoes, or other input fields), so skill-text examples like 'quest show 12 --json' can no longer key detection. First real invocation wins (documented in header + test). Two regression fixtures (skill-prose-transcript.jsonl, multi-invocation-transcript.jsonl) + two tests in tests/hooks.test.mjs. Did not touch skill/agent example text (record constraint) or quests 12/15/16.
- validation_summary: `npm test` -> tests 93, pass 93, fail 0. Regression proof: `git stash push -- hooks/subagent-stop.mjs` then `node --test tests/hooks.test.mjs` -> the two new tests FAIL (pass 7, fail 2) against old hook; `git stash pop` -> all 93 pass. Done-when: (1) per-entry parse of tool_use commands DONE (executorQuestId in hooks/subagent-stop.mjs); (2) quest 15 regression reproduced DONE (skill-prose-transcript keys real id 1 not prose id 12); (3) first-real-wins deterministic+documented DONE (multi-invocation test blocks quest 2), conservative-allow preserved (unrelated/unknown-quest tests green); (4) `npm test` passes DONE.
