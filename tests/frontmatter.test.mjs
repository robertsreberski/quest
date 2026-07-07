import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, serializeFrontmatter, FrontmatterError } from "../lib/frontmatter.mjs";

test("round-trips scalars and inline lists", () => {
  const front = { id: 7, title: "Add --json output: everywhere", status: "todo", depends_on: [1, 2], created: "2026-07-07T12:00:00Z" };
  const text = `${serializeFrontmatter(front)}\n\nbody`;
  const parsed = parseFrontmatter(text);
  assert.deepEqual(parsed.front, front);
  assert.equal(parsed.body, "\nbody");
});

test("numbers parse as numbers, strings stay strings", () => {
  const { front } = parseFrontmatter("---\nid: 12\ntitle: 12 monkeys plan\n---\n");
  assert.equal(front.id, 12);
  assert.equal(front.title, "12 monkeys plan");
});

test("rejects nested yaml with a precise error", () => {
  assert.throws(() => parseFrontmatter("---\ngithub:\n  repo: a/b\n---\n"), FrontmatterError);
});

test("rejects duplicate keys", () => {
  assert.throws(() => parseFrontmatter("---\nid: 1\nid: 2\n---\n"), /duplicate/);
});

test("rejects valueless keys", () => {
  assert.throws(() => parseFrontmatter("---\nparent:\n---\n"), /no value/);
});

test("rejects unterminated fence", () => {
  assert.throws(() => parseFrontmatter("---\nid: 1\n"), /unterminated/);
});

test("rejects missing fence", () => {
  assert.throws(() => parseFrontmatter("# hi\n"), /must start/);
});

test("empty list round-trips", () => {
  const { front } = parseFrontmatter("---\ndepends_on: []\n---\n");
  assert.deepEqual(front.depends_on, []);
});
