#!/usr/bin/env node
/**
 * Tests for anchor-check.mjs.
 *
 * Two halves, because the script has two ways of being wrong.
 *
 * The PARSING half pins the judgement in `parseInSiteLink`: which hrefs are
 * anchor CLAIMS this site must honour, and which are not. Getting that wrong in
 * the permissive direction produces false failures on external links; getting it
 * wrong in the strict direction silently skips the links that break.
 *
 * The GATE half runs the real CLI against a real HTTP server and asserts it
 * FAILS. A checker that cannot fail is worse than no checker, and every case
 * here is one that previously exited 0 while verifying nothing: a response
 * truncated mid-body, a run that found no links at all, and an invocation
 * through a symlinked path (`/tmp` -> `/private/tmp` on macOS), which made the
 * entry-point guard false so `main` never ran.
 *
 *   node scripts/anchor-check.test.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodeEntities, hrefsIn, idsIn, parseInSiteLink } from "./anchor-check.mjs";

const SCRIPT = fileURLToPath(new URL("./anchor-check.mjs", import.meta.url));
const cases = [];
function test(name, body) {
  cases.push([name, body]);
}

/* ---------------------------------------------------------------- parsing */

test("ids come from any element, not only headings", () => {
  const ids = idsIn('<h2 id="set-it">x</h2><div id="nd-page"></div><span>no id</span>');
  assert.deepEqual([...ids].sort(), ["nd-page", "set-it"]);
});

test("attributes are read whichever way they are quoted", () => {
  assert.deepEqual([...idsIn("<h2 id='single'>x</h2>")], ["single"]);
  assert.deepEqual(hrefsIn("<a href='/docs/a#b'>x</a>"), ["/docs/a#b"]);
});

test("extracted values are the DOM values, not the HTML serialization", () => {
  // `## Custom [#a&b]` renders as id="a&amp;b" and is matched by #a%26b.
  assert.deepEqual([...idsIn('<h2 id="a&amp;b">x</h2>')], ["a&b"]);
  assert.deepEqual(hrefsIn('<a href="/docs/x?a=1&amp;b=2#f">y</a>'), ["/docs/x?a=1&b=2#f"]);
  assert.equal(decodeEntities("&#39;&#x2F;&lt;&gt;&quot;"), "'/<>\"");
  assert.equal(decodeEntities("&notanentity; &amp"), "&notanentity; &amp");
});

test("an entity-encoded id matches its percent-escaped link, and the raw one does not", () => {
  const ids = idsIn('<h2 id="a&amp;b">x</h2>');
  assert.equal(ids.has(parseInSiteLink("/docs/x#a%26b", "/docs/y").fragment), true);
  assert.equal(ids.has(parseInSiteLink("/docs/x#a%26amp;b", "/docs/y").fragment), false);
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

test("a scheme-absolute link to this same site is an in-site claim, not an external link", () => {
  for (const host of ["https://openphonex.com", "https://www.openphonex.com"]) {
    assert.deepEqual(parseInSiteLink(`${host}/docs/voice-behavior#missing`, "/docs/changelog"), {
      targetPath: "/docs/voice-behavior",
      fragment: "missing",
    });
  }
});

test("a relative link resolves against the page it appears on", () => {
  assert.deepEqual(parseInSiteLink("voice-behavior#missing", "/docs/changelog"), {
    targetPath: "/docs/voice-behavior",
    fragment: "missing",
  });
  assert.deepEqual(parseInSiteLink("../scopes#x", "/docs/x"), { targetPath: "/scopes", fragment: "x" });
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

test("genuinely external targets and non-http schemes are skipped", () => {
  for (const href of [
    "http://example.test/#y",
    "https://github.com/OpenPhonex#y",
    "mailto:support@openphonex.com#y",
    "tel:+3725555555#y",
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

/* ------------------------------------------------------------------- gate */

function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

function runCheck(scriptPath, localUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, "--local", localUrl], { cwd: path.dirname(SCRIPT) });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (out += c));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, out }));
  });
}

test("a run that finds no links at all FAILS instead of reporting success", async () => {
  const { server, url } = await serve((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><body><p>no links here</p></body></html>");
  });
  try {
    const { code, out } = await runCheck(SCRIPT, url);
    assert.equal(code, 1, out);
    assert.match(out, /no in-site anchor links found/);
    assert.doesNotMatch(out, /All in-site anchors resolve/);
  } finally {
    server.close();
  }
});

// Two ways a body stops early. A reset (RST) surfaces as a request-level
// error; a graceful half-close (FIN) does not, and that is the one that used to
// resolve a partial page -- or never settle at all, letting the process exit 0
// having verified nothing.
for (const [label, cut] of [
  ["the connection is reset", (res) => res.socket.destroy()],
  ["the connection is half-closed", (res) => res.socket.end()],
]) {
  test(`a response truncated mid-body FAILS when ${label}`, async () => {
    const { server, url } = await serve((_req, res) => {
      // Promise a long body, send a little of it, then stop.
      res.writeHead(200, { "content-type": "text/html", "content-length": "4096" });
      res.write('<html><body><a href="/docs/x#y">');
      cut(res);
    });
    try {
      const { code, out } = await runCheck(SCRIPT, url);
      assert.equal(code, 1, out);
      assert.doesNotMatch(out, /All in-site anchors resolve/);
    } finally {
      server.close();
    }
  });
}

test("invoking the script through a symlinked path still runs the gate", async () => {
  // `import.meta.url` is a realpath and `process.argv[1]` is not, so comparing
  // them unresolved made `main` never run -- silently, with exit code 0.
  const dir = await mkdtemp(path.join(tmpdir(), "anchor-check-symlink-"));
  const link = path.join(dir, "anchor-check.mjs");
  await symlink(SCRIPT, link);
  const { server, url } = await serve((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><body><p>no links here</p></body></html>");
  });
  try {
    const { code, out } = await runCheck(link, url);
    assert.notEqual(out.trim(), "", "the gate produced no output at all, so it never ran");
    assert.equal(code, 1, out);
    assert.match(out, /no in-site anchor links found/);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a page whose in-site anchor is missing FAILS, and the same page passes once the id exists", async () => {
  let ids = "";
  const { server, url } = await serve((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<html><body><a href="/docs/voice-behavior#target">x</a>${req.url === "/docs/voice-behavior" ? ids : ""}</body></html>`);
  });
  try {
    const broken = await runCheck(SCRIPT, url);
    assert.equal(broken.code, 1, broken.out);
    assert.match(broken.out, /no element with id="target"/);

    ids = '<h2 id="target">t</h2>';
    const fixed = await runCheck(SCRIPT, url);
    assert.equal(fixed.code, 0, fixed.out);
    assert.match(fixed.out, /All in-site anchors resolve/);
  } finally {
    server.close();
  }
});

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
