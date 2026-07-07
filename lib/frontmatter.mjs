// Strict YAML-subset frontmatter: only `key: scalar` and `key: [a, b]` lines.
// No nesting, no multi-line values, no quoting. Reject anything else with a
// precise error — records are written only by this tool, so canonical form is
// guaranteed and hand-edits that stray from it must fail loudly.

export class FrontmatterError extends Error {}

const KEY_RE = /^([a-z][a-z0-9_]*):(?: (.*))?$/;

function parseScalar(raw) {
  const s = raw.trim();
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  return s;
}

export function parseFrontmatter(text) {
  const lines = text.split("\n");
  if (lines[0] !== "---") throw new FrontmatterError("record must start with `---` frontmatter fence");
  const end = lines.indexOf("---", 1);
  if (end === -1) throw new FrontmatterError("unterminated frontmatter: closing `---` fence not found");
  const front = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const m = line.match(KEY_RE);
    if (!m) {
      throw new FrontmatterError(
        `frontmatter line ${i + 1} is not \`key: value\`: "${line}" (nested/multi-line YAML is not supported; see contract-spec.md)`,
      );
    }
    const [, key, rawValue] = m;
    if (key in front) throw new FrontmatterError(`duplicate frontmatter key "${key}"`);
    if (rawValue === undefined || rawValue.trim() === "") {
      throw new FrontmatterError(`frontmatter key "${key}" has no value (omit optional keys entirely)`);
    }
    const v = rawValue.trim();
    if (v.startsWith("[")) {
      if (!v.endsWith("]")) throw new FrontmatterError(`frontmatter key "${key}": inline list must close with ]`);
      const inner = v.slice(1, -1).trim();
      front[key] = inner === "" ? [] : inner.split(",").map((x) => parseScalar(x));
    } else {
      front[key] = parseScalar(v);
    }
  }
  return { front, body: lines.slice(end + 1).join("\n") };
}

export function serializeFrontmatter(front) {
  const out = ["---"];
  for (const [key, value] of Object.entries(front)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      out.push(`${key}: [${value.join(", ")}]`);
    } else {
      out.push(`${key}: ${value}`);
    }
  }
  out.push("---");
  return out.join("\n");
}
