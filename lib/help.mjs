// All human-facing guidance lives here so it can be snapshot-tested and can't
// drift silently from the contract. Keep texts deterministic (no timestamps).

export const INTRO = `quest — goal-loop engineering for coding agents

Work is planned as quests: contracts with an Objective, evidence-checkable
"Done when" items, and a Validation loop. Agents (or you) work them in
iterations that end in checkpoints; \`quest-run\` drives headless workers.`;

export const COMMANDS = {
  init: {
    purpose: "Create a quest store (.quests/) and install project agent templates",
    usage: "quest init [--backend local|github] [--repo owner/name] [--agents-md] [--no-agents]",
    flags: [
      ["--backend <b>", "record storage: local files (default) or github issues"],
      ["--repo <owner/name>", "required with --backend github"],
      ["--agents-md", "append a quest orientation section to ./AGENTS.md"],
      ["--no-agents", "skip installing .codex/agents and .claude/agents templates"],
    ],
    example: "quest init",
  },
  create: {
    purpose: "Create a new quest (the only way records are born)",
    usage: "quest create --title T --objective O --done-when D --validation V [more flags]",
    flags: [
      ["--title <t>", "quest title (required)"],
      ["--objective <o>", "one concrete outcome, ≤3 sentences (required)"],
      ["--done-when <d>", "evidence-checkable condition; repeatable (≥1 required)"],
      ["--validation <cmds>", "exact commands run each iteration (required)"],
      ["--constraint <c>", "hard guardrail; repeatable"],
      ["--milestone <m>", "discrete testable unit; repeatable"],
      ["--context <text>", "pointers: files + symbols, related quests"],
      ["--out-of-scope <o>", "explicit exclusion; repeatable"],
      ["--parent <id>", "epic this quest belongs to"],
      ["--depends-on <ids>", "comma-separated quest ids that must complete first"],
      ["--worker <w>", "claude (default) or codex"],
      ["--model <m>", "worker model; default inherit (store config)"],
      ["--effort <e>", "worker reasoning effort (e.g. xhigh)"],
      ["--max-iterations <n>", "session budget (default from config)"],
      ["--max-cost <usd>", "cost budget for headless runs"],
      ["--priority <p>", "p0 | p1 | p2 (default from config)"],
    ],
    example: `quest create --title "Add dark mode" \\
  --objective "Settings page offers a dark theme that persists." \\
  --done-when "toggling theme updates the UI and survives reload" \\
  --done-when "\`npm test\` passes including new theme tests" \\
  --validation "npm test"`,
  },
  list: {
    purpose: "List quests (filter by status, parent, or readiness)",
    usage: "quest list [--status <s>] [--parent <id>] [--ready] [--json]",
    flags: [
      ["--status <s>", "todo | in_progress | blocked | complete | cancelled"],
      ["--parent <id>", "children of an epic"],
      ["--ready", "todo quests whose depends_on are all complete, excluding epics with open children (dispatch order)"],
      ["--json", "machine-readable output"],
    ],
    example: "quest list --ready",
  },
  show: {
    purpose: "Show a quest record in full",
    usage: "quest show <id> [--json]",
    flags: [["--json", "parsed record: frontmatter, body, checkpoints[]"]],
    example: "quest show 3 --json",
  },
  start: {
    purpose: "Mark a quest in_progress (todo → in_progress)",
    usage: "quest start <id>",
    flags: [],
    example: "quest start 3",
  },
  checkpoint: {
    purpose: "Record iteration evidence and drive the quest's status",
    usage: "quest checkpoint <id> --status <s> --summary <what> --validation <evidence> [flags]",
    flags: [
      ["--status <s>", "in_progress | complete | blocked (required)"],
      ["--summary <text>", "what changed, one line per milestone touched (required)"],
      ["--validation <text>", "commands + observed results; complete requires backticked commands (required)"],
      ["--iteration <n>", "iteration number (default: previous + 1)"],
      ["--pr <url>", "pull request for this quest's work"],
      ["--sha <sha>", "HEAD sha the evidence was gathered at"],
      ["--failed <text>", "approaches that failed, with reasons"],
      ["--expansion <text>", "rationale when scope compatibly expanded"],
      ["--note <text>", "free-form trailing note"],
    ],
    example: `quest checkpoint 3 --status complete \\
  --summary "M2 done — theme persistence via localStorage" \\
  --validation "\`npm test\` → 42 passed, 0 failed"`,
  },
  cancel: {
    purpose: "Cancel a quest (terminal; reason is recorded)",
    usage: "quest cancel <id> --reason <why>",
    flags: [["--reason <why>", "required — recorded in the record"]],
    example: 'quest cancel 4 --reason "superseded by quest 7"',
  },
  reopen: {
    purpose: "Reopen a complete quest back into the loop (complete → in_progress)",
    usage: "quest reopen <id> --reason <why>",
    flags: [["--reason <why>", "required — recorded in an audited reopen checkpoint"]],
    example: 'quest reopen 4 --reason "review found npm audit criticals after completion"',
  },
  edit: {
    purpose: "Compatibly expand a quest (additions only; anchors are immutable)",
    usage: "quest edit <id> [--add-done-when D]… [--add-milestone M]… [--add-context C] --rationale <why>",
    flags: [
      ["--add-done-when <d>", "append a Done-when item; repeatable"],
      ["--add-milestone <m>", "append a milestone; repeatable"],
      ["--add-context <text>", "append to Context"],
      ["--rationale <why>", "required — why this is a compatible expansion"],
    ],
    example: 'quest edit 3 --add-done-when "works in Safari" --rationale "same objective, missed browser"',
  },
  lint: {
    purpose: "Check records against the contract spec",
    usage: "quest lint [<id> | --all]",
    flags: [["--all", "lint every record in the store"]],
    example: "quest lint --all",
  },
  amend: {
    purpose: "Append a numbered protocol amendment (retro output)",
    usage: "quest amend --text <amendment>",
    flags: [["--text <t>", "the amendment, imperative, citing its evidence (required)"]],
    example: 'quest amend --text "Always re-verify cited symbols at orient time — quest 12 lost an iteration to a stale reference."',
  },
  protocol: {
    purpose: "Print the loop protocol + this store's local amendments",
    usage: "quest protocol",
    flags: [],
    example: "quest protocol",
  },
  runs: {
    purpose: "Show headless runner activity (from .quests/runs.ndjson)",
    usage: "quest runs [--active] [--json]",
    flags: [
      ["--active", "only runs that started and have not ended"],
      ["--json", "machine-readable output"],
    ],
    example: "quest runs --active",
  },
  codex: {
    purpose: "Inspect or install Quest's native Codex integration",
    usage: "quest codex doctor [--json] | quest codex install-agents [--scope project|user] [--dry-run] [--force] [--json]",
    flags: [
      ["doctor", "check Codex CLI, multi-agent support, plugin install/version, hooks, skill roots, and native-agent templates"],
      ["install-agents", "install quest-executor and quest-reviewer as native Codex custom agents"],
      ["--scope <s>", "project (default: .codex/agents at repo root) or user (~/.codex/agents)"],
      ["--dry-run", "show intended agent writes without changing files"],
      ["--force", "replace existing agent files"],
      ["--json", "machine-readable output"],
    ],
    example: "quest codex install-agents --scope project && quest codex doctor",
  },
  claude: {
    purpose: "Inspect or install Quest's native Claude Code integration",
    usage: "quest claude doctor [--json] | quest claude install-agents [--scope project|user] [--dry-run] [--force] [--json]",
    flags: [
      ["doctor", "check Claude CLI, plugin install/version, and native-agent templates"],
      ["install-agents", "install quest-executor and quest-reviewer as native Claude Code custom agents"],
      ["--scope <s>", "project (default: .claude/agents at repo root) or user (~/.claude/agents)"],
      ["--dry-run", "show intended agent writes without changing files"],
      ["--force", "replace existing agent files"],
      ["--json", "machine-readable output"],
    ],
    example: "quest claude install-agents --scope project && quest claude doctor",
  },
};

export function renderCommandHelp(name) {
  const c = COMMANDS[name];
  const lines = [c.purpose, "", `Usage: ${c.usage}`];
  if (c.flags.length) {
    lines.push("", "Flags:");
    const w = Math.max(...c.flags.map(([f]) => f.length));
    for (const [flag, desc] of c.flags) lines.push(`  ${flag.padEnd(w)}  ${desc}`);
  }
  lines.push("", "Example:", ...c.example.split("\n").map((l) => `  ${l}`));
  return lines.join("\n");
}

export function renderGeneralHelp() {
  const lines = [INTRO, "", "Commands:"];
  const w = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
  for (const [name, c] of Object.entries(COMMANDS)) lines.push(`  quest ${name.padEnd(w)}  ${c.purpose}`);
  lines.push("", "Run `quest <command> --help` for flags and a copy-pasteable example.", "Headless workers: see `quest-run --help`.");
  return lines.join("\n");
}

export function renderStatusOverview({ counts, ready, activeRuns, backend }) {
  const lines = [`Quest store: ${backend} backend`];
  const parts = ["todo", "in_progress", "blocked", "complete", "cancelled"]
    .filter((s) => counts[s])
    .map((s) => `${counts[s]} ${s}`);
  lines.push(parts.length ? `Quests: ${parts.join(" · ")}` : "Quests: none yet");
  if (ready.length) {
    lines.push("", "Ready to work (dependencies met):");
    for (const q of ready.slice(0, 3)) lines.push(`  ${q.id}. [${q.priority}] ${q.title}`);
    lines.push("", "Next: `quest show <id>` to read one, or dispatch with `quest-run <id>`.");
  } else if (!parts.length) {
    lines.push("", "Next: create your first quest — see `quest create --help` (or use the $quest:plan skill).");
  } else {
    lines.push("", "Nothing ready to start. `quest list` to see everything.");
  }
  if (activeRuns > 0) lines.push("", `Active headless runs: ${activeRuns} — inspect with \`quest runs --active\`.`);
  return lines.join("\n");
}

export function renderNoStore() {
  return [
    "No quest store found (searched for .quests/ from here upward).",
    "",
    "Get started:",
    "  quest init            create a local store here",
    "  quest init --backend github --repo owner/name",
    "",
    "Then: `quest create --help` shows how to author your first quest.",
  ].join("\n");
}

export function renderInitNextSteps(backend, { agentsInstalled = true } = {}) {
  return [
    "",
    "Store created. Next steps:",
    ...(agentsInstalled ? ["  0. Restart agent sessions so newly installed project templates are loaded"] : []),
    "  1. Author a quest:   quest create --help   (or $quest:plan in your agent session)",
    "  2. Check it:         quest lint --all",
    "  3. Work it:          $quest:work <id> in-session, or quest-run <id> headless",
    ...(agentsInstalled ? [] : ["  Agent templates skipped; install later with `quest codex install-agents --scope project` and `quest claude install-agents --scope project`."]),
    ...(backend === "github" ? ["", "Records live as GitHub issues; config and amendments stay local in .quests/."] : []),
  ].join("\n");
}
