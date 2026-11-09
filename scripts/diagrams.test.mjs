#!/usr/bin/env node
/**
 * Tests for the docs pictures (public/diagrams/, <Diagram name="…" />).
 *
 * The requirements they guard: no label in a picture is smaller than 14px
 * (titles are 15-16), so a picture stays readable in the page column; and
 * every picture a page names exists.
 *
 *   node scripts/diagrams.test.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIAGRAMS = path.join(ROOT, "public/diagrams");
const CONTENT = path.join(ROOT, "content");
const MIN_LABEL_PX = 14;

const cases = [];
function test(name, body) {
  cases.push([name, body]);
}

function mdxFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return mdxFiles(full);
    return entry.name.endsWith(".mdx") ? [full] : [];
  });
}

const svgs = readdirSync(DIAGRAMS).filter((name) => name.endsWith(".svg"));

test(`every text in public/diagrams is at least ${MIN_LABEL_PX}px`, () => {
  assert.ok(svgs.length > 0, "no pictures found");
  const small = [];
  let texts = 0;
  for (const name of svgs) {
    const svg = readFileSync(path.join(DIAGRAMS, name), "utf8");
    for (const m of svg.matchAll(/<text\b([^>]*)>([^<]*)</g)) {
      texts += 1;
      const size = /font-size(?:="|:\s*)([0-9.]+)/.exec(m[1]);
      if (!size) {
        small.push(`${name}: "${m[2]}" has no font-size`);
      } else if (Number(size[1]) < MIN_LABEL_PX) {
        small.push(`${name}: "${m[2]}" is ${size[1]}px`);
      }
    }
    assert.ok(!/<tspan\b[^>]*font-size/.test(svg), `${name}: a tspan sets its own font-size`);
  }
  assert.ok(texts > 0, "no text elements were checked");
  assert.deepEqual(small, []);
});

test("every <Diagram name> on a page exists in public/diagrams", () => {
  let used = 0;
  for (const file of mdxFiles(CONTENT)) {
    for (const m of readFileSync(file, "utf8").matchAll(/<Diagram\s+name="([^"]+)"/g)) {
      used += 1;
      assert.ok(existsSync(path.join(DIAGRAMS, m[1])), `${path.relative(ROOT, file)}: ${m[1]} is missing`);
    }
  }
  assert.ok(used > 0, "no <Diagram> was found");
});

/* ------------------------------------------------------------------ run */

let failed = 0;
for (const [name, body] of cases) {
  try {
    await body();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
