#!/usr/bin/env node
// Dual-harness discoverability gate:
// - every agents/<name>.md has a <name>.toml kept in parallel (same name,
//   non-empty description, toml has developer_instructions)
// - every skills/<name>/SKILL.md has frontmatter (name matching its dir, a
//   "Use when" description) and an agents/openai.yaml interface companion
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
let failures = 0;
const fail = (msg) => { failures++; console.error(`parity: ${msg}`); };

// agents/*.md ↔ *.toml
const agentsDir = join(root, "agents");
for (const file of readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
  const stem = file.replace(/\.md$/, "");
  const md = readFileSync(join(agentsDir, file), "utf8");
  const tomlPath = join(agentsDir, `${stem}.toml`);
  const nameMatch = md.match(/^name: (.+)$/m);
  if (!nameMatch) fail(`agents/${file}: missing frontmatter name`);
  else if (nameMatch[1].trim() !== stem) fail(`agents/${file}: name "${nameMatch[1].trim()}" ≠ filename stem "${stem}"`);
  if (!/^description: .+/m.test(md)) fail(`agents/${file}: missing frontmatter description`);
  if (!/^model: .+/m.test(md)) fail(`agents/${file}: missing frontmatter model`);
  if (!existsSync(tomlPath)) {
    fail(`agents/${file}: missing Codex companion ${stem}.toml`);
    continue;
  }
  const toml = readFileSync(tomlPath, "utf8");
  const tomlName = toml.match(/^name = "(.+)"$/m);
  if (!tomlName || tomlName[1] !== stem) fail(`agents/${stem}.toml: name must be "${stem}"`);
  if (!/^description = ".+"$/m.test(toml)) fail(`agents/${stem}.toml: missing description`);
  if (!/^developer_instructions = """/m.test(toml)) fail(`agents/${stem}.toml: missing developer_instructions block`);
}
for (const file of readdirSync(agentsDir).filter((f) => f.endsWith(".toml"))) {
  const stem = file.replace(/\.toml$/, "");
  if (!existsSync(join(agentsDir, `${stem}.md`))) fail(`agents/${file}: orphan toml (no ${stem}.md)`);
}

// skills/<name>/SKILL.md + agents/openai.yaml
const skillsDir = join(root, "skills");
for (const dir of readdirSync(skillsDir)) {
  const skillPath = join(skillsDir, dir);
  if (!statSync(skillPath).isDirectory()) continue;
  const md = join(skillPath, "SKILL.md");
  if (!existsSync(md)) {
    fail(`skills/${dir}: missing SKILL.md`);
    continue;
  }
  const text = readFileSync(md, "utf8");
  const name = text.match(/^name: (.+)$/m);
  if (!name || name[1].trim() !== dir) fail(`skills/${dir}/SKILL.md: frontmatter name must be "${dir}"`);
  const desc = text.match(/^description: (.+)$/m);
  if (!desc) fail(`skills/${dir}/SKILL.md: missing description`);
  else if (!/use when/i.test(desc[1])) fail(`skills/${dir}/SKILL.md: description must contain a "Use when…" trigger`);
  const yaml = join(skillPath, "agents", "openai.yaml");
  if (!existsSync(yaml)) fail(`skills/${dir}: missing agents/openai.yaml Codex interface companion`);
  else {
    const y = readFileSync(yaml, "utf8");
    for (const key of ["display_name", "short_description"]) {
      if (!y.includes(`${key}:`)) fail(`skills/${dir}/agents/openai.yaml: missing ${key}`);
    }
  }
}

if (failures) {
  console.error(`\nparity: ${failures} problem(s)`);
  process.exit(1);
}
console.log("parity: OK");
