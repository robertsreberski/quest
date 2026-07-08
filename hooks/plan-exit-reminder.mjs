#!/usr/bin/env node
// Plan-exit reminder hook. When a Quest-generated plan handoff is accepted,
// remind the parent session that the next run is orchestration, not direct
// implementation. Anything uncertain is a silent no-op.

import { writeSync } from "node:fs";

const REMINDER = [
  "Quest plan handoff accepted.",
  "This run is about orchestration, not direct implementation:",
  "create or confirm the quest records, run `quest lint`, then switch to `$quest:orchestrate` to dispatch workers, verify checkpoints, and close the wave.",
].join(" ");

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function hookEventName(payload) {
  return payload?.hook_event_name ?? payload?.hookEventName ?? "";
}

function toolName(payload) {
  return payload?.tool_name ?? payload?.toolName ?? payload?.tool?.name ?? "";
}

function lastAssistantMessage(payload) {
  const value = payload?.last_assistant_message ?? payload?.lastAssistantMessage;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return "";
}

function questPlanHandoff(text) {
  if (!text) return false;
  const hasQuestPlan = /(?:\$?quest:plan\b|\bquest create\b|\bquest lint\b|<proposed_plan>)/i.test(text);
  const hasOrchestrate = /(?:\$?quest:orchestrate\b|\borchestration\b|\borchestrator\b)/i.test(text);
  return hasQuestPlan && hasOrchestrate;
}

function postToolUseText(payload) {
  const parts = [];
  for (const key of ["tool_input", "toolInput", "tool_response", "toolResponse"]) {
    const value = payload?.[key];
    if (typeof value === "string") parts.push(value);
    else if (value && typeof value === "object") parts.push(JSON.stringify(value));
  }
  return parts.join("\n");
}

function shouldRemind(payload) {
  const event = hookEventName(payload);
  if (event === "PostToolUse" && toolName(payload) === "ExitPlanMode") {
    return questPlanHandoff(postToolUseText(payload));
  }
  if (event === "Stop") {
    return questPlanHandoff(lastAssistantMessage(payload));
  }
  return false;
}

try {
  const raw = await readStdin();
  let payload = {};
  try { payload = raw.trim() ? JSON.parse(raw) : {}; } catch { payload = {}; }
  if (shouldRemind(payload)) writeSync(1, JSON.stringify({ systemMessage: REMINDER }) + "\n");
  process.exit(0);
} catch {
  process.exit(0);
}
