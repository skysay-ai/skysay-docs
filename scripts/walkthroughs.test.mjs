#!/usr/bin/env node
/**
 * Tests for the docs walkthroughs (src/walkthroughs/, <Walkthrough id="…" />).
 *
 * The requirement they guard: a page with a walkthrough must still carry every
 * step as text in its markdown export (the `.md` URL and /llms-full.txt), and a
 * page must never embed a walkthrough, tab or link that doesn't exist.
 *
 *   node scripts/walkthroughs.test.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { remarkLLMs } from "fumadocs-core/mdx-plugins/remark-llms";

import { docs } from "../source.config.ts";
import { getWalkthrough, walkthroughNodeText, walkthroughs } from "../src/walkthroughs/index.js";
import { flowsOf } from "../src/walkthroughs/markdown.js";
import { validateWalkthrough } from "../src/walkthroughs/validate.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS = path.join(ROOT, "content/docs");

const cases = [];
function test(name, body) {
  cases.push([name, body]);
}

// The processed markdown the site serves for a page holding one walkthrough,
// produced by fumadocs' own remarkLLMs with the stringify option the docs
// collection is configured with in source.config.ts.
function exportedMarkdown(attributes) {
  const tree = {
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "text", value: "Before." }] },
      { type: "mdxJsxFlowElement", name: "Walkthrough", attributes, children: [] },
    ],
  };
  const options = docs.docs.postprocess.includeProcessedMarkdown;
  const file = { data: {} };
  remarkLLMs.call(undefined, { ...options, _data: true })(tree, file);
  return file.data.markdown;
}

const literal = (name, value) => ({ type: "mdxJsxAttribute", name, value });

function allSteps(w) {
  return w.tabs.flatMap((tab) => flowsOf(tab).flatMap((flow) => flow.steps.map((step) => ({ tab, flow, step }))));
}

function walkBlocks(blocks, visit) {
  for (const b of blocks ?? []) {
    visit(b);
    if (b.type === "details") walkBlocks(b.blocks, visit);
  }
}

function strings(w) {
  const out = [];
  const add = (v) => typeof v === "string" && out.push(v);
  for (const { step } of allSteps(w)) {
    add(step.intro);
    add(step.side?.tip?.text);
    for (const blocks of [step.main, step.side?.blocks]) {
      walkBlocks(blocks, (b) => {
        for (const v of Object.values(b)) add(v);
        for (const f of b.fields ?? []) add(f.hint);
        for (const i of b.items ?? []) add(typeof i === "string" ? i : i.detail);
        for (const r of b.rows ?? []) (Array.isArray(r) ? r : [r.title, r.detail]).forEach(add);
      });
    }
  }
  return out;
}

/* ------------------------------------------------------- markdown export */

for (const w of Object.values(walkthroughs)) {
  test(`${w.id}: the page's markdown export carries every step, value and code block`, () => {
    const md = exportedMarkdown([literal("id", w.id)]);
    assert.ok(md.startsWith("Before."), "the text around the walkthrough is kept");
    assert.ok(!md.includes("<Walkthrough"), "the bare tag must be replaced by the steps");
    for (const { tab, flow, step } of allSteps(w)) {
      assert.ok(md.includes(tab.label), `tab ${tab.label}`);
      if (flow.label) assert.ok(md.includes(flow.label), `method ${flow.label}`);
      assert.ok(md.includes(`${step.label}: ${step.title}`), `step ${step.label}: ${step.title}`);
      if (step.side?.tip) assert.ok(md.includes(step.side.tip.text), `tip of ${step.title}`);
      walkBlocks(step.main, (b) => {
        if (b.type === "code") assert.ok(md.includes(b.code), `code block in ${step.title}`);
        if (b.type === "fields") for (const f of b.fields) assert.ok(md.includes(f.label), `field ${f.label}`);
      });
      walkBlocks(step.side?.blocks, (b) => {
        if (b.type === "copy") assert.ok(md.includes(b.value), `copy value ${b.label}`);
      });
    }
  });
}

test("Skysay's SIP address always comes with the note that the workspace's own address wins", () => {
  const w = getWalkthrough("import-a-number");
  const md = exportedMarkdown([literal("id", w.id)]);
  const note = "Your workspace shows the address for your connection when you create it; use that one if it differs.";
  for (const tab of w.tabs) {
    const blocks = tab.steps[0].side.blocks;
    const shows = JSON.stringify(blocks).includes("168.144.8.195");
    if (shows) assert.ok(blocks.some((b) => b.type === "hint" && b.text === note), `${tab.id} shows the address without the note`);
  }
  assert.ok(md.includes("168.144.8.195") && md.includes(note), "the text export shows the address and the note");
});

test("a walkthrough id given as an expression fails instead of exporting nothing", () => {
  assert.throws(
    () => exportedMarkdown([{ type: "mdxJsxAttribute", name: "id", value: { type: "mdxJsxAttributeValueExpression", value: "x" } }]),
    /literal id/,
  );
});

test("an unknown walkthrough id fails closed, in the export and in the registry", () => {
  assert.throws(() => exportedMarkdown([literal("id", "no-such-walkthrough")]), /Unknown walkthrough id/);
  assert.throws(() => getWalkthrough("no-such-walkthrough"), /Unknown walkthrough id/);
  assert.throws(() => getWalkthrough("toString"), /Unknown walkthrough id/);
});

test("other MDX elements keep the default export", () => {
  assert.equal(walkthroughNodeText({ type: "mdxJsxFlowElement", name: "Callout", attributes: [] }), undefined);
  assert.equal(walkthroughNodeText({ type: "paragraph", children: [] }), undefined);
});

/* ------------------------------------------------------------ validation */

test("validation refuses an unknown block type and a choice whose selection isn't an option", () => {
  const base = getWalkthrough("launch-a-campaign");
  const withMain = (main) => ({
    ...base,
    tabs: [{ id: "t", label: "T", steps: [{ label: "S", title: "S", main }] }],
  });
  assert.doesNotThrow(() => validateWalkthrough(withMain([{ type: "text", text: "ok" }])));
  assert.throws(() => validateWalkthrough(withMain([{ type: "carousel" }])), /unknown block type/);
  assert.throws(
    () => validateWalkthrough(withMain([{ type: "choice", options: ["A"], selected: "B" }])),
    /not an option/,
  );
  assert.throws(() => validateWalkthrough({ ...base, defaultTab: "nope" }), /defaultTab/);
});

/* ------------------------------------------------- pages and their links */

const pages = readdirSync(DOCS).filter((f) => f.endsWith(".mdx"));
const embeds = pages.flatMap((file) =>
  [...readFileSync(path.join(DOCS, file), "utf8").matchAll(/<Walkthrough\b([^>]*)\/>/g)].map((m) => ({
    file,
    id: /\bid="([^"]+)"/.exec(m[1])?.[1],
    tab: /\btab="([^"]+)"/.exec(m[1])?.[1],
  })),
);

test("every <Walkthrough> on a page names a walkthrough and tab that exist", () => {
  assert.ok(embeds.length >= 7, `expected the seven embeds, found ${embeds.length}`);
  for (const e of embeds) {
    const w = getWalkthrough(e.id);
    if (e.tab) assert.ok(w.tabs.some((t) => t.id === e.tab), `${e.file}: tab ${e.tab}`);
  }
  for (const id of Object.keys(walkthroughs)) {
    assert.ok(embeds.some((e) => e.id === id), `walkthrough ${id} is on no page`);
  }
});

test("every docs link inside a walkthrough points at an existing page", () => {
  let links = 0;
  for (const w of Object.values(walkthroughs)) {
    for (const s of strings(w)) {
      for (const m of s.matchAll(/\]\((\/docs\/[^)#\s]+)(#[^)\s]*)?\)/g)) {
        links += 1;
        const slug = m[1].replace(/^\/docs\//, "");
        assert.ok(existsSync(path.join(DOCS, `${slug}.mdx`)), `${w.id}: ${m[1]} has no page`);
      }
    }
  }
  assert.ok(links > 0, "no links were checked");
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
