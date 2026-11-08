#!/usr/bin/env node
/**
 * Tests for the docs sidebar's collapsible sections: src/lib/docs-tree.js turns
 * each meta.json separator and the pages up to the next one into one folder.
 * That module is plain JS, so this imports it for real (no hand-copy).
 *
 *   node scripts/docs-tree.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseDocsSections } from "../src/lib/docs-sections.js";
import { groupSeparatorsIntoSections } from "../src/lib/docs-tree.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const meta = JSON.parse(readFileSync(path.join(ROOT, "content/docs/meta.json"), "utf8"));

const cases = [];
function test(name, body) {
  cases.push([name, body]);
}

const ICON = { icon: "an icon element" };
const page = (name) => ({ type: "page", name, url: `/docs/${name}` });
const separator = (name) => ({ type: "separator", name, ...ICON });

const tree = {
  name: "Docs",
  $id: "root",
  children: [page("lead"), separator("One"), page("a"), page("b"), separator("Two"), page("c")],
};

test("each separator and its pages become one open, collapsible folder", () => {
  const { children } = groupSeparatorsIntoSections(tree);
  assert.deepEqual(
    children.map((node) => [node.type, node.name]),
    [["page", "lead"], ["folder", "One"], ["folder", "Two"]],
  );
  const [, one, two] = children;
  assert.deepEqual(one.children.map((node) => node.name), ["a", "b"]);
  assert.deepEqual(two.children.map((node) => node.name), ["c"]);
  for (const folder of [one, two]) {
    assert.equal(folder.defaultOpen, true, "every section starts open");
    assert.equal(folder.collapsible, true, "every section can be folded");
  }
});

test("a section carries no icon", () => {
  for (const node of groupSeparatorsIntoSections(tree).children) {
    if (node.type === "folder") assert.equal("icon" in node, false, `${node.name} has an icon`);
  }
});

test("no separator is left in the tree", () => {
  assert.equal(
    groupSeparatorsIntoSections(tree).children.some((node) => node.type === "separator"),
    false,
  );
});

test("the input tree is not changed", () => {
  const before = JSON.stringify(tree);
  groupSeparatorsIntoSections(tree);
  assert.equal(JSON.stringify(tree), before);
});

test("folder ids are distinct", () => {
  const ids = groupSeparatorsIntoSections(tree).children.filter((n) => n.type === "folder").map((n) => n.$id);
  assert.equal(new Set(ids).size, ids.length);
});

test("meta.json: one folder per section, holding exactly its pages", () => {
  const sections = parseDocsSections(meta.pages);
  const input = {
    children: meta.pages.map((item) =>
      /^---.+---$/.test(item) ? separator(item.replace(/^---(?:\[[^\]]+])?/, "").replace(/---$/, "")) : page(item),
    ),
  };
  const folders = groupSeparatorsIntoSections(input).children;
  assert.equal(folders.length, sections.length);
  folders.forEach((folder, index) => {
    assert.equal(folder.name, sections[index].title);
    assert.deepEqual(folder.children.map((node) => node.name), sections[index].slugs);
  });
});

let failed = 0;
for (const [name, body] of cases) {
  try {
    body();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n${error.stack}`);
  }
}
console.log(`${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
