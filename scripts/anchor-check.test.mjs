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

import { decodeEntities, decodeFragment, hrefsIn, idsIn, parseInSiteLink, sitemapPaths } from "./anchor-check.mjs";

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

test("ids are the DOM values, not the HTML serialization", () => {
  // `## Custom [#a&b]` renders as id="a&amp;b" and is matched by #a%26b.
  assert.deepEqual([...idsIn('<h2 id="a&amp;b">x</h2>')], ["a&b"]);
  assert.equal(decodeEntities("&#39;&#x2F;&lt;&gt;&quot;"), "'/<>\"");
  assert.equal(decodeEntities("&notanentity; &amp"), "&notanentity; &amp");
});

test("HTML character references are decoded exactly once along each path", () => {
  // Decoding twice would collapse the literal id `a&amp;b` onto `a&b`, so a
  // link to one would silently resolve against the other.
  const raw = hrefsIn('<a href="#a&amp;amp;b">x</a>')[0];
  assert.equal(raw, "#a&amp;amp;b", "the extractor returns the attribute text");
  const link = parseInSiteLink(raw, "/docs/x");
  assert.equal(link.fragment, "a&amp;b");
  assert.equal(idsIn('<h2 id="a&amp;amp;b">x</h2>').has(link.fragment), true);
  assert.equal(idsIn('<h2 id="a&amp;b">x</h2>').has(link.fragment), false);
});

test("script, style and template text is not a source of ids or hrefs", () => {
  // Next.js inlines the rendered page into self.__next_f.push(...), so a fenced
  // example documenting `<div id='ghost'>` appears there verbatim.
  const html =
    `<script>self.__next_f.push([1,"<div id='ghost'>x</div><a href='/docs/x#ghost'>y</a>"])</script>` +
    `<style>a[href='/docs/y#styled']{color:red}</style>` +
    `<template><h2 id="inert">i</h2></template>` +
    `<h2 id="real">r</h2><a href="/docs/z#real">z</a>`;
  assert.deepEqual([...idsIn(html)], ["real"]);
  assert.deepEqual(hrefsIn(html), ["/docs/z#real"]);
});

test("the page list is read from the site's own sitemap", () => {
  // Deriving URLs from filenames meant re-implementing the Fumadocs loader's
  // routing, and it got three rules wrong: a folder index colliding with a
  // sibling page, `(group)` directories, and `.md` as a second extension. The
  // sitemap is built from `source.getPages()`, so it already knows all of it.
  assert.deepEqual(
    sitemapPaths(
      "<urlset><url><loc>https://skysay.ai/docs/guide/index</loc></url>" +
        "<url><loc>https://skysay.ai/docs/(group)/x</loc></url>" +
        "<url><loc>https://skysay.ai/docs/extra/</loc></url>" +
        "<url><loc>https://skysay.ai/blog/launch</loc></url>" +
        "<url><loc>https://skysay.ai/docs/guide/index</loc></url></urlset>",
    ),
    ["/blog/launch", "/docs/(group)/x", "/docs/extra", "/docs/guide/index"],
  );
});

test("sitemap locs are entity-decoded and unparseable ones are skipped", () => {
  assert.deepEqual(
    sitemapPaths("<urlset><loc>https://skysay.ai/docs/a?x=1&amp;y=2</loc><loc>not a url</loc></urlset>"),
    ["/docs/a"],
  );
  assert.deepEqual(sitemapPaths(""), []);
});

test("&nbsp; decodes to U+00A0, the character the DOM holds", () => {
  assert.deepEqual([...idsIn('<h2 id="a&nbsp;b">x</h2>')], ["a\u00a0b"]);
  assert.equal(idsIn('<h2 id="a&nbsp;b">x</h2>').has("a b"), false);
  assert.equal(parseInSiteLink("/docs/x#a%C2%A0b", "/docs/y").fragment, "a\u00a0b");
});

test("a literal percent sign does not defeat the escapes beside it", () => {
  // `## Custom [#100%-café]` is a supported heading; the URL parser encodes the
  // accent, and decoding the whole fragment at once throws on the literal `%`.
  assert.equal(parseInSiteLink("/docs/x#100%-caf%C3%A9", "/docs/y").fragment, "100%-café");
  assert.equal(decodeFragment("100%"), "100%");
  assert.equal(decodeFragment("caf%C3%A9"), "café");
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
    rawFragment: "set-it-through-the-api",
  });
});

test("a same-page fragment resolves against the page it appears on", () => {
  assert.deepEqual(parseInSiteLink("#how-the-worker-uses-it", "/docs/voice-behavior"), {
    targetPath: "/docs/voice-behavior",
    fragment: "how-the-worker-uses-it",
    rawFragment: "how-the-worker-uses-it",
  });
});

test("a scheme-absolute link to this same site is an in-site claim, not an external link", () => {
  for (const host of ["https://skysay.ai", "https://www.skysay.ai"]) {
    assert.deepEqual(parseInSiteLink(`${host}/docs/voice-behavior#missing`, "/docs/changelog"), {
      targetPath: "/docs/voice-behavior",
      fragment: "missing",
      rawFragment: "missing",
    });
  }
});

test("a relative link resolves against the page it appears on", () => {
  assert.deepEqual(parseInSiteLink("voice-behavior#missing", "/docs/changelog"), {
    targetPath: "/docs/voice-behavior",
    fragment: "missing",
    rawFragment: "missing",
  });
  assert.deepEqual(parseInSiteLink("../scopes#x", "/docs/x"), {
    targetPath: "/scopes",
    fragment: "x",
    rawFragment: "x",
  });
});

test("a trailing slash on the target is normalized away", () => {
  assert.equal(parseInSiteLink("/docs/scopes/#calls", "/docs/x").targetPath, "/docs/scopes");
});

test("a query string before the fragment is dropped", () => {
  assert.deepEqual(parseInSiteLink("/docs/x?q=1#frag", "/docs/y"), {
    targetPath: "/docs/x",
    fragment: "frag",
    rawFragment: "frag",
  });
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
    "https://github.com/Skysay#y",
    "mailto:support@skysay.ai#y",
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

// The gate reads its page list from the site's own sitemap, so every fixture
// server publishes one. Sitemap COMPLETENESS is parity-check.mjs's job, by path;
// nothing here compares counts.
function sitemapXml(paths = ["/docs/a"]) {
  return `<?xml version="1.0"?><urlset>${paths.map((one) => `<url><loc>https://skysay.ai${one}</loc></url>`).join("")}</urlset>`;
}

function serve(handler, sitemapPathList) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/docs/sitemap.xml") {
        res.writeHead(200, { "content-type": "application/xml" });
        res.end(sitemapXml(sitemapPathList));
        return;
      }
      handler(req, res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

function html(body) {
  return `<html><body>${body}</body></html>`;
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
    res.end(html("<p>no links here</p>"));
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

test("a page listed only in the sitemap is still checked", async () => {
  // This is the whole class the filename-derived mapper kept getting wrong:
  // a folder index colliding with a sibling, a `(group)` directory, a `.md`
  // page. Whatever the loader publishes, the gate visits.
  const { server, url } = await serve(
    (req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(req.url === "/docs/(group)/odd" ? html('<a href="#gone">x</a>') : html("<p>ordinary</p>"));
    },
    ["/docs/(group)/odd"],
  );
  try {
    const { code, out } = await runCheck(SCRIPT, url);
    assert.equal(code, 1, out);
    assert.match(out, /no element with id="gone"/);
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
    res.end(html("<p>no links here</p>"));
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
    res.end(html(`<a href="/docs/voice-behavior#target">x</a>${req.url === "/docs/voice-behavior" ? ids : ""}`));
  }, ["/docs/voice-behavior"]);
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

test("a broken anchor whose id appears only inside a script FAILS", async () => {
  const { server, url } = await serve((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html(`<a href="#ghost">x</a><script>self.__next_f.push([1,"<div id='ghost'></div>"])</script>`));
  });
  try {
    const { code, out } = await runCheck(SCRIPT, url);
    assert.equal(code, 1, out);
    assert.match(out, /no element with id="ghost"/);
  } finally {
    server.close();
  }
});

// `next.config.mjs` keeps `/docs/agents` resolving to `/docs/mcp`; a browser
// carries the fragment across that hop unless the Location supplies its own.
function redirectServer(location, destinationBody) {
  return (req, res) => {
    if (req.url === "/docs/old") {
      res.writeHead(308, { location });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html(req.url === "/docs/new" ? destinationBody : '<a href="/docs/old#target">x</a>'));
  };
}

test("an in-site redirect is followed and the fragment checked at its destination", async () => {
  const { server, url } = await serve(redirectServer("/docs/new", '<h2 id="target">t</h2>'));
  try {
    const { code, out } = await runCheck(SCRIPT, url);
    assert.equal(code, 0, out);
    assert.match(out, /All in-site anchors resolve/);
  } finally {
    server.close();
  }
});

test("a redirect naming the configured server by its absolute URL is still in-site", async () => {
  // Next.js commonly redirects using the request URL, so Location comes back
  // absolute on 127.0.0.1:<port>. Recognising only the public hosts rejected it.
  const server = http.createServer((req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    if (req.url === "/docs/sitemap.xml") {
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(sitemapXml());
      return;
    }
    if (req.url === "/docs/old") {
      res.writeHead(308, { location: `${origin}/docs/new` });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html(req.url === "/docs/new" ? '<h2 id="target">t</h2>' : '<a href="/docs/old#target">x</a>'));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    const { code, out } = await runCheck(SCRIPT, `http://127.0.0.1:${server.address().port}`);
    assert.equal(code, 0, out);
    assert.match(out, /All in-site anchors resolve/);
  } finally {
    server.close();
  }
});

test("a fragment supplied by the redirect REPLACES the one the link carried", async () => {
  // Browsers use the Location's fragment when it has one. Checking the original
  // instead fails a working link and passes a broken one.
  const good = await serve(redirectServer("/docs/new#current", '<h2 id="current">c</h2>'));
  try {
    const { code, out } = await runCheck(SCRIPT, good.url);
    assert.equal(code, 0, out);
    assert.match(out, /All in-site anchors resolve/);
  } finally {
    good.server.close();
  }

  const bad = await serve(redirectServer("/docs/new#missing", '<h2 id="target">t</h2>'));
  try {
    const { code, out } = await runCheck(SCRIPT, bad.url);
    assert.equal(code, 1, out);
    assert.match(out, /no element with id="missing"/);
    assert.match(out, /redirected from \/docs\/old/);
  } finally {
    bad.server.close();
  }
});

test("an id containing literal percent-escapes still matches its link", async () => {
  // Chromium matches the LITERAL fragment against ids before trying the decoded
  // one, so a custom id written `100%-caf%C3%A9` is reachable as written.
  const { server, url } = await serve((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html('<a href="#100%-caf%C3%A9">x</a><h2 id="100%-caf%C3%A9">h</h2>'));
  });
  try {
    const { code, out } = await runCheck(SCRIPT, url);
    assert.equal(code, 0, out);
    assert.match(out, /All in-site anchors resolve/);
  } finally {
    server.close();
  }
});

test("a redirect loop FAILS instead of spinning", async () => {
  const { server, url } = await serve((req, res) => {
    if (req.url === "/docs/loop") {
      res.writeHead(308, { location: "/docs/loop" });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html('<a href="/docs/loop#target">x</a>'));
  });
  try {
    const { code, out } = await runCheck(SCRIPT, url);
    assert.equal(code, 1, out);
    assert.match(out, /more than 5 redirects/);
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
