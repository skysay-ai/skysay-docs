#!/usr/bin/env node
/**
 * Tests for the Product part of the site-root /llms.txt
 * (src/lib/llms-pages.js): where the web app's page index is read from, the
 * contract a fetched file must meet, which lines are copied, and the fallback
 * to the bundled list.
 *
 *   node --test scripts/llms-pages.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PAGES_BUNDLED_MARKER,
  PAGES_LIVE_MARKER,
  PAGES_SOURCE_LINE,
  loadPagesIndex,
  pagesFileUrls,
  parseEnglishPages,
} from "../src/lib/llms-pages.js";

const FIXTURE = readFileSync(new URL("../tests/fixtures/web-llms/llms-pages.txt", import.meta.url), "utf8");
const BUNDLED = "- [Pricing](https://skysay.ai/pricing): bundled";

function textResponse(body, { status = 200, contentType = "text/plain; charset=utf-8" } = {}) {
  return new Response(new TextEncoder().encode(body), { status, headers: contentType ? { "content-type": contentType } : {} });
}
const serving = (byUrl, seen = []) => async (url) => {
  seen.push(url);
  const answer = byUrl[url];
  if (answer instanceof Error) throw answer;
  return answer ?? textResponse("not found", { status: 404 });
};
const PUBLIC = "https://skysay.ai/llms-pages.txt";

test("the internal URL is tried first, then the public one", () => {
  assert.deepEqual(pagesFileUrls({}), [PUBLIC]);
  assert.deepEqual(pagesFileUrls({ WEB_INTERNAL_URL: " http://web:3000/ " }), ["http://web:3000/llms-pages.txt", PUBLIC]);
});

test("only the English section's page lines are copied", () => {
  const lines = parseEnglishPages(FIXTURE).split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines.every((line) => line.startsWith("- [")));
  assert.ok(lines[1].startsWith("- [Pricing](https://skysay.ai/pricing.md)"));
  assert.doesNotMatch(lines.join("\n"), /de\.md/);
  assert.equal(parseEnglishPages("# Skysay pages\n" + PAGES_SOURCE_LINE + "\n\n## Deutsch\n\n- [x](y): z\n"), "");
});

test("a live file replaces the bundled list and is marked live", async () => {
  const index = await loadPagesIndex(BUNDLED, { env: {}, fetchImpl: serving({ [PUBLIC]: textResponse(FIXTURE) }) });
  assert.deepEqual(index, { marker: PAGES_LIVE_MARKER, lines: parseEnglishPages(FIXTURE), live: true });
});

test("the internal source wins, and a failing one falls through to the public URL", async () => {
  const env = { WEB_INTERNAL_URL: "http://web:3000" };
  const seen = [];
  const internalOnly = FIXTURE.replace("AI Answering Service for Plumbers", "From The Internal Source");
  let index = await loadPagesIndex(BUNDLED, { env, fetchImpl: serving({ "http://web:3000/llms-pages.txt": textResponse(internalOnly), [PUBLIC]: textResponse(FIXTURE) }, seen) });
  assert.match(index.lines, /From The Internal Source/);
  assert.deepEqual(seen, ["http://web:3000/llms-pages.txt"]);
  index = await loadPagesIndex(BUNDLED, { env, fetchImpl: serving({ "http://web:3000/llms-pages.txt": new Error("down"), [PUBLIC]: textResponse(FIXTURE) }) });
  assert.equal(index.live, true);
  assert.doesNotMatch(index.lines, /From The Internal Source/);
});

test("anything that is not the contract file leaves the bundled list in place", async () => {
  const bundled = { marker: PAGES_BUNDLED_MARKER, lines: BUNDLED, live: false };
  const cases = {
    "a 404": textResponse(FIXTURE, { status: 404 }),
    "an HTML error page": textResponse("<html>" + FIXTURE, { contentType: "text/html" }),
    "a text file without the source line": textResponse(FIXTURE.replace(PAGES_SOURCE_LINE, "> source: skysay-blog")),
    "a file with no English page lines": textResponse("# Skysay pages\n" + PAGES_SOURCE_LINE + "\n\n## English\n\n## Deutsch\n\n- [x](y): z\n"),
    "a thrown fetch": new Error("network"),
  };
  for (const [name, answer] of Object.entries(cases)) {
    assert.deepEqual(await loadPagesIndex(BUNDLED, { env: {}, fetchImpl: serving({ [PUBLIC]: answer }) }), bundled, name);
  }
});
