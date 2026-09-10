#!/usr/bin/env node
/**
 * Tests for the docs section tab row's meta.json -> tabs derivation.
 *
 * src/lib/docs-tabs.jsx is a .jsx file (it calls `resolveDocsIcon`, which
 * returns JSX) and imports content/docs/meta.json directly, both of which a
 * plain `node` script cannot do without a bundler — same reason
 * scripts/sidebar-icons.test.mjs can't `import` src/lib/docs-icons.jsx
 * directly. src/lib/docs-sections.js is the plain (non-JSX) half of that
 * module that both docs-tabs.jsx and this script import for real, so this
 * tests the actual grouping code path, not a hand-copy of it.
 *
 *   node scripts/docs-tabs.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { docsSlugToUrl, parseDocsSections } from "../src/lib/docs-sections.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const META_PATH = path.join(ROOT, "content/docs/meta.json");

const cases = [];
function test(name, body) {
  cases.push([name, body]);
}

/* -------------------------------------------------------------- fixtures */

const meta = JSON.parse(readFileSync(META_PATH, "utf8"));
const sections = parseDocsSections(meta.pages);

// Mirrors src/lib/docs-tabs.jsx's own mapping exactly (it is a thin wrapper:
// per section, `url` = the first page's URL, `urls` = every page's URL). If
// that file's mapping ever diverges from this, it's the mapping — not the
// grouping in docs-sections.js — that changed, and this pins it too.
const tabs = sections.map((section) => {
  const urls = section.slugs.map(docsSlugToUrl);
  return { title: section.title, icon: section.icon, url: urls[0], urls: new Set(urls) };
});

/* ------------------------------------------------------------------ gate */

test("parseDocsSections rejects a page listed before any separator", () => {
  assert.throws(() => parseDocsSections(["orphan-page", "---[Rocket]Get started---", "index"]), /before any/);
});

test("meta.json's pages divide into at least one section, each with a page", () => {
  assert.ok(sections.length > 0, "expected at least one section");
  for (const section of sections) {
    assert.ok(section.slugs.length > 0, `section "${section.title}" has no pages`);
  }
});

test("every section separator carries an icon name", () => {
  const missing = sections.filter((s) => !s.icon).map((s) => s.title);
  assert.deepEqual(missing, [], `sections with no [Icon] prefix: ${missing.join(", ")}`);
});

test("every meta.json page appears in exactly one tab's urls, and every tab url is a real page", () => {
  const allSlugs = meta.pages.filter((item) => !/^---.*---$/.test(item));
  const allUrls = new Set(allSlugs.map(docsSlugToUrl));

  // Every real page URL is covered by exactly one tab.
  for (const url of allUrls) {
    const covering = tabs.filter((tab) => tab.urls.has(url));
    assert.equal(covering.length, 1, `"${url}" is covered by ${covering.length} tabs, expected exactly 1`);
  }

  // Every URL a tab claims is a real page (no stale/typo'd entries).
  for (const tab of tabs) {
    for (const url of tab.urls) {
      assert.ok(allUrls.has(url), `tab "${tab.title}" claims "${url}", which is not a page in meta.json`);
    }
    assert.ok(tab.urls.has(tab.url), `tab "${tab.title}"'s own url "${tab.url}" is not in its urls set`);
  }

  // And the two sets have the same total size as a cross-check (catches a
  // tab silently listing a URL count that adds up despite covering the
  // wrong ones -- redundant with the per-url loop above, kept as a coarse
  // trip-wire).
  const unionSize = new Set(tabs.flatMap((tab) => [...tab.urls])).size;
  assert.equal(unionSize, allUrls.size);
});

test("a tab's url is always its section's first listed page", () => {
  for (const section of sections) {
    const tab = tabs.find((t) => t.title === section.title);
    assert.equal(tab.url, docsSlugToUrl(section.slugs[0]));
  }
});

test("docsSlugToUrl maps the index page to the bare /docs root", () => {
  assert.equal(docsSlugToUrl("index"), "/docs");
  assert.equal(docsSlugToUrl("quickstart"), "/docs/quickstart");
});

/* ------------------------------------------------------------------- run */

let failed = 0;
for (const [name, body] of cases) {
  try {
    await body();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${name}\n      ${error instanceof Error ? error.message : error}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed.`);
if (failed > 0) process.exitCode = 1;
