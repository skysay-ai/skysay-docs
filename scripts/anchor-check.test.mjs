#!/usr/bin/env node
/**
 * Unit tests for anchor-check.mjs's parsing rules.
 *
 * The end-to-end behaviour is proved by running the check itself (it found the
 * three real broken anchors this script was written for). What is worth pinning
 * separately is the judgement in `parseInSiteLink`: which hrefs are anchor
 * CLAIMS this site must honour, and which are not. Getting that wrong in the
 * permissive direction produces false failures on external links; getting it
 * wrong in the strict direction silently skips the links that break.
 *
 *   node scripts/anchor-check.test.mjs
 */
import assert from "node:assert/strict";

import { hrefsIn, idsIn, parseInSiteLink } from "./anchor-check.mjs";

const cases = [];
function test(name, body) {
  cases.push([name, body]);
}

test("ids come from any element, not only headings", () => {
  const ids = idsIn('<h2 id="set-it">x</h2><div id="nd-page"></div><span>no id</span>');
  assert.deepEqual([...ids].sort(), ["nd-page", "set-it"]);
});

test("hrefs are read verbatim", () => {
  assert.deepEqual(hrefsIn('<a href="/docs/a#b">x</a><a href="https://e.test">y</a>'), [
    "/docs/a#b",
    "https://e.test",
  ]);
});

test("an in-site link with a fragment is checked", () => {
  assert.deepEqual(parseInSiteLink("/docs/delivery-profiles#set-it-through-the-api", "/docs/changelog"), {
    targetPath: "/docs/delivery-profiles",
    fragment: "set-it-through-the-api",
  });
});

test("a same-page fragment resolves against the page it appears on", () => {
  assert.deepEqual(parseInSiteLink("#how-the-worker-uses-it", "/docs/voice-behavior"), {
    targetPath: "/docs/voice-behavior",
    fragment: "how-the-worker-uses-it",
  });
});

test("a trailing slash on the target is normalized away", () => {
  assert.equal(parseInSiteLink("/docs/scopes/#calls", "/docs/x").targetPath, "/docs/scopes");
});

test("a query string before the fragment is dropped", () => {
  assert.deepEqual(parseInSiteLink("/docs/x?q=1#frag", "/docs/y"), { targetPath: "/docs/x", fragment: "frag" });
});

test("a percent-escaped fragment is decoded before comparison", () => {
  assert.equal(parseInSiteLink("/docs/x#caf%C3%A9", "/docs/y").fragment, "café");
});

test("a malformed escape is compared literally rather than throwing", () => {
  assert.equal(parseInSiteLink("/docs/x#100%", "/docs/y").fragment, "100%");
});

test("case is preserved: DOM ids are case-sensitive", () => {
  assert.equal(parseInSiteLink("/docs/x#SetIt", "/docs/y").fragment, "SetIt");
});

test("a fragment containing '#' keeps everything after the first one", () => {
  assert.equal(parseInSiteLink("/docs/x#a#b", "/docs/y").fragment, "a#b");
});

test("links with no fragment are not anchor claims", () => {
  assert.equal(parseInSiteLink("/docs/scopes", "/docs/x"), null);
});

test("a bare '#' is a no-op link, not an anchor claim", () => {
  assert.equal(parseInSiteLink("#", "/docs/x"), null);
});

test("external and non-http schemes are skipped", () => {
  for (const href of [
    "https://openphonex.com/docs/x#y",
    "http://example.test/#y",
    "mailto:support@openphonex.com#y",
    "//cdn.example.test/a#y",
  ]) {
    assert.equal(parseInSiteLink(href, "/docs/x"), null, href);
  }
});

test("plain-text and asset targets carry no ids and are skipped", () => {
  for (const href of ["/docs/scopes.md#x", "/llms.txt#x", "/api/openapi.json#x", "/logo.svg#x"]) {
    assert.equal(parseInSiteLink(href, "/docs/x"), null, href);
  }
});

test("a relative link this site does not use is skipped rather than guessed at", () => {
  assert.equal(parseInSiteLink("../scopes#x", "/docs/x"), null);
});

let failed = 0;
for (const [name, body] of cases) {
  try {
    body();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${name}\n      ${error instanceof Error ? error.message : error}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed.`);
if (failed > 0) process.exitCode = 1;
