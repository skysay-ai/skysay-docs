#!/usr/bin/env node
/**
 * Tests for the Blog part of the site-root /llms.txt and /llms-full.txt
 * (src/lib/llms-blog.js): the fetch order, the contract checks that make a
 * fetched file count, the parsing of the blog app's files, and the fallback
 * to the bundled legacy snapshot.
 *
 * tests/fixtures/blog-llms/ holds the blog app's two files in the contract
 * format, built from the three frozen posts in content/blog exactly as this
 * app rendered them before the blog moved.
 *
 *   node scripts/llms-blog.test.mjs
 *
 * With --local, it also checks a running production server (`npm start`):
 * the marker line sits directly under the Blog heading of both files; when
 * the server rendered the bundled legacy snapshot, the snapshot's Blog
 * section and blog corpus are byte-identical to what the fixtures parse to
 * (so a blog app serving those fixtures changes nothing but the marker); and
 * /raw/blog/<slug> is a 308 to /blog/<slug>.md while /blog/<slug>.md still
 * reaches the raw handler through the rewrite.
 *
 *   node scripts/llms-blog.test.mjs --local http://127.0.0.1:3000
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BLOG_SOURCE_LINE,
  LIVE_MARKER,
  SNAPSHOT_MARKER,
  blogFileUrls,
  fetchBlogFile,
  loadBlogCorpus,
  loadBlogIndex,
  parseBlogCorpus,
  parseBlogIndex,
} from "../src/lib/llms-blog.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIXTURES = path.join(ROOT, "tests/fixtures/blog-llms");
const INDEX_FIXTURE = readFileSync(path.join(FIXTURES, "llms.txt"), "utf8");
const CORPUS_FIXTURE = readFileSync(path.join(FIXTURES, "llms-full.txt"), "utf8");

const args = process.argv.slice(2);
const localIndex = args.indexOf("--local");
const LOCAL = localIndex >= 0 ? args[localIndex + 1]?.replace(/\/$/, "") : null;

const cases = [];
function test(name, body) {
  cases.push([name, body]);
}

/* ----------------------------------------------------------- test doubles */

function textResponse(body, { status = 200, contentType = "text/plain; charset=utf-8" } = {}) {
  // Bytes, not a string: a string body would get an implicit text/plain type.
  return new Response(new TextEncoder().encode(body), { status, headers: contentType ? { "content-type": contentType } : {} });
}

// A fetch double that answers per URL and records every URL it was asked for.
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push(url);
    assert.ok(init.signal instanceof AbortSignal, "every fetch carries a timeout signal");
    assert.equal(init.redirect, "manual");
    const route = routes[url];
    if (!route) {
      throw new TypeError(`fetch failed: ${url}`);
    }
    return typeof route === "function" ? route() : route;
  };
  return { impl, calls };
}

const INTERNAL = "http://skysay-blog:8080";
const internalUrl = (file) => `${INTERNAL}/blog/${file}`;
const publicUrl = (file) => `https://skysay.ai/blog/${file}`;

// A real HTTP server for the timeout cases, since a fetch double cannot show
// that AbortSignal.timeout actually cuts a hanging request.
async function withServer(handler, body) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await body(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

/* ------------------------------------------------------------------ cases */

test("fixtures follow the contract the blog app serves", () => {
  const index = INDEX_FIXTURE.split("\n");
  assert.equal(index[0], "# Skysay Blog");
  assert.equal(index[1], BLOG_SOURCE_LINE);
  assert.equal(index[2], "");
  const corpus = CORPUS_FIXTURE.split("\n");
  assert.equal(corpus[0], "# Skysay Blog — full corpus");
  assert.equal(corpus[1], BLOG_SOURCE_LINE);
  assert.equal(corpus[2], "");
});

test("parseBlogIndex keeps exactly the '- [' lines, newest first, nothing else", () => {
  const lines = parseBlogIndex(INDEX_FIXTURE).split("\n");
  assert.deepEqual(
    lines.map((line) => line.match(/\]\((https:\/\/skysay\.ai\/blog\/[^)]+)\)/)[1]),
    [
      "https://skysay.ai/blog/gpt-live-seven-languages",
      "https://skysay.ai/blog/launch",
      "https://skysay.ai/blog/works-with-any-ai",
    ],
  );
  const noisy = `# Skysay Blog\n${BLOG_SOURCE_LINE}\n\nintro text\n- not a post link\n-[x](y)\n- [A](https://skysay.ai/blog/a): a\n  - [nested](x)\n## heading\n- [B](https://skysay.ai/blog/b): b\n`;
  assert.equal(parseBlogIndex(noisy), "- [A](https://skysay.ai/blog/a): a\n- [B](https://skysay.ai/blog/b): b");
});

test("parseBlogCorpus returns everything after the first blank line that follows line 2", () => {
  const body = parseBlogCorpus(CORPUS_FIXTURE);
  assert.ok(body.startsWith("# We ran GPT-Live-1 through 107 calls"));
  assert.ok(!body.endsWith("\n"), "trailing newlines are trimmed so the corpus joins the template byte-for-byte");
  assert.equal(body.split("\n\n---\n\n").filter((block) => /^# .+\nURL: \/blog\//.test(block)).length, 3);
  // The blank line is searched for from line 3 on, so extra header lines are skipped.
  assert.equal(parseBlogCorpus(`# T\n${BLOG_SOURCE_LINE}\n> extra\n\n# Post\nURL: /blog/p\n\nbody\n\n\n`), "# Post\nURL: /blog/p\n\nbody");
  assert.equal(parseBlogCorpus(`# T\n${BLOG_SOURCE_LINE}`), "");
});

test("blogFileUrls: internal first when set, then the canonical public URL", () => {
  assert.deepEqual(blogFileUrls("llms.txt", {}), [publicUrl("llms.txt")]);
  assert.deepEqual(blogFileUrls("llms.txt", { BLOG_INTERNAL_URL: "" }), [publicUrl("llms.txt")]);
  assert.deepEqual(blogFileUrls("llms.txt", { BLOG_INTERNAL_URL: "   " }), [publicUrl("llms.txt")]);
  assert.deepEqual(blogFileUrls("llms-full.txt", { BLOG_INTERNAL_URL: `${INTERNAL}/` }), [
    internalUrl("llms-full.txt"),
    publicUrl("llms-full.txt"),
  ]);
});

test("a valid internal answer is used and the public URL is never fetched", async () => {
  const { impl, calls } = fakeFetch({ [internalUrl("llms.txt")]: () => textResponse(INDEX_FIXTURE) });
  const text = await fetchBlogFile("llms.txt", { env: { BLOG_INTERNAL_URL: INTERNAL }, fetchImpl: impl });
  assert.equal(text, INDEX_FIXTURE);
  assert.deepEqual(calls, [internalUrl("llms.txt")]);
});

test("unset BLOG_INTERNAL_URL goes straight to the public URL", async () => {
  const { impl, calls } = fakeFetch({ [publicUrl("llms.txt")]: () => textResponse(INDEX_FIXTURE) });
  assert.equal(await fetchBlogFile("llms.txt", { env: {}, fetchImpl: impl }), INDEX_FIXTURE);
  assert.deepEqual(calls, [publicUrl("llms.txt")]);
});

for (const [name, internalAnswer] of [
  ["a 404", () => textResponse(INDEX_FIXTURE, { status: 404 })],
  ["a 500", () => textResponse(INDEX_FIXTURE, { status: 500 })],
  ["a 308 redirect (not followed)", () => new Response(null, { status: 308, headers: { location: "/elsewhere" } })],
  ["a 201", () => textResponse(INDEX_FIXTURE, { status: 201 })],
  ["text/html", () => textResponse(INDEX_FIXTURE, { contentType: "text/html; charset=utf-8" })],
  ["text/markdown", () => textResponse(INDEX_FIXTURE, { contentType: "text/markdown" })],
  ["text/plainx", () => textResponse(INDEX_FIXTURE, { contentType: "text/plainx" })],
  ["no content-type", () => textResponse(INDEX_FIXTURE, { contentType: null })],
  ["a wrong line 2", () => textResponse(INDEX_FIXTURE.replace(BLOG_SOURCE_LINE, "> source: something-else"))],
  ["the source line on line 3", () => textResponse(`# Skysay Blog\n\n${BLOG_SOURCE_LINE}\n- [A](x): a\n`)],
  ["CRLF line endings", () => textResponse(INDEX_FIXTURE.replaceAll("\n", "\r\n"))],
  ["an empty body", () => textResponse("")],
  ["a network error", () => {
    throw new TypeError("fetch failed");
  }],
]) {
  test(`internal answer with ${name} fails and falls through to the public URL`, async () => {
    const { impl, calls } = fakeFetch({
      [internalUrl("llms.txt")]: internalAnswer,
      [publicUrl("llms.txt")]: () => textResponse(INDEX_FIXTURE),
    });
    assert.equal(await fetchBlogFile("llms.txt", { env: { BLOG_INTERNAL_URL: INTERNAL }, fetchImpl: impl }), INDEX_FIXTURE);
    assert.deepEqual(calls, [internalUrl("llms.txt"), publicUrl("llms.txt")]);
  });
}

test("content-type matching ignores case and parameters", async () => {
  for (const contentType of ["text/plain", "TEXT/PLAIN; charset=UTF-8", "text/plain;charset=utf-8"]) {
    const { impl } = fakeFetch({ [publicUrl("llms.txt")]: () => textResponse(INDEX_FIXTURE, { contentType }) });
    assert.equal(await fetchBlogFile("llms.txt", { env: {}, fetchImpl: impl }), INDEX_FIXTURE, contentType);
  }
});

test("both sources failing returns null and never throws", async () => {
  const { impl, calls } = fakeFetch({});
  assert.equal(await fetchBlogFile("llms.txt", { env: { BLOG_INTERNAL_URL: INTERNAL }, fetchImpl: impl }), null);
  assert.deepEqual(calls, [internalUrl("llms.txt"), publicUrl("llms.txt")]);
  const throwsSync = () => {
    throw new Error("boom");
  };
  assert.equal(await fetchBlogFile("llms.txt", { env: { BLOG_INTERNAL_URL: "not a url" }, fetchImpl: throwsSync }), null);
  const badBody = async () => ({ status: 200, headers: new Headers({ "content-type": "text/plain" }), text: async () => { throw new Error("reset"); } });
  assert.equal(await fetchBlogFile("llms.txt", { env: {}, fetchImpl: badBody }), null);
});

test("a server that never answers is cut off by the timeout", async () => {
  await withServer(
    () => {
      /* never respond */
    },
    async (base) => {
      const started = Date.now();
      const text = await fetchBlogFile("llms.txt", {
        env: { BLOG_INTERNAL_URL: base },
        fetchImpl: (url, init) => (url.startsWith(base) ? fetch(url, init) : Promise.reject(new TypeError("offline"))),
        timeoutMs: 200,
      });
      assert.equal(text, null);
      assert.ok(Date.now() - started < 2000, `gave up after ${Date.now() - started} ms`);
    },
  );
});

test("a body that stalls after the headers is cut off by the same timeout", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.write(`# Skysay Blog\n${BLOG_SOURCE_LINE}\n\n`);
      /* never end */
    },
    async (base) => {
      const started = Date.now();
      const text = await fetchBlogFile("llms.txt", {
        env: { BLOG_INTERNAL_URL: base },
        fetchImpl: (url, init) => (url.startsWith(base) ? fetch(url, init) : Promise.reject(new TypeError("offline"))),
        timeoutMs: 200,
      });
      assert.equal(text, null);
      assert.ok(Date.now() - started < 2000, `gave up after ${Date.now() - started} ms`);
    },
  );
});

test("a real HTTP blog app serving the fixture is accepted end to end", async () => {
  await withServer(
    (req, res) => {
      const body = req.url === "/blog/llms.txt" ? INDEX_FIXTURE : req.url === "/blog/llms-full.txt" ? CORPUS_FIXTURE : null;
      res.writeHead(body ? 200 : 404, { "content-type": "text/plain; charset=utf-8" });
      res.end(body ?? "not found");
    },
    async (base) => {
      const offlinePublic = (url, init) => (url.startsWith(base) ? fetch(url, init) : Promise.reject(new TypeError("offline")));
      const options = { env: { BLOG_INTERNAL_URL: base }, fetchImpl: offlinePublic };
      const index = await loadBlogIndex(() => assert.fail("legacy snapshot must not be read when the blog answers"), options);
      assert.deepEqual(index, { marker: LIVE_MARKER, lines: parseBlogIndex(INDEX_FIXTURE) });
      const corpus = await loadBlogCorpus(() => assert.fail("legacy snapshot must not be read when the blog answers"), options);
      assert.deepEqual(corpus, { marker: LIVE_MARKER, body: parseBlogCorpus(CORPUS_FIXTURE) });
    },
  );
});

test("with no blog app, the bundled legacy snapshot is used and labelled", async () => {
  const { impl } = fakeFetch({});
  const index = await loadBlogIndex(() => "- [legacy](https://skysay.ai/blog/legacy): l", { env: {}, fetchImpl: impl });
  assert.deepEqual(index, { marker: SNAPSHOT_MARKER, lines: "- [legacy](https://skysay.ai/blog/legacy): l" });
  const corpus = await loadBlogCorpus(async () => "# legacy\nURL: /blog/legacy", { env: {}, fetchImpl: impl });
  assert.deepEqual(corpus, { marker: SNAPSHOT_MARKER, body: "# legacy\nURL: /blog/legacy" });
});

test("the markers are the exact verification lines", () => {
  assert.equal(LIVE_MARKER, "> blog source: skysay-blog (live)");
  assert.equal(SNAPSHOT_MARKER, "> blog source: bundled legacy snapshot");
});

/* ----------------------------------------------- against a running server */

async function get(url) {
  const response = await fetch(url, { redirect: "manual" });
  return { status: response.status, headers: response.headers, body: await response.text() };
}

function blogSection(document, heading, end) {
  const start = document.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `missing ${heading}`);
  assert.equal(document.indexOf(`\n${heading}\n`, start + 1), -1, `${heading} appears once`);
  const rest = document.slice(start + heading.length + 2);
  const newline = rest.indexOf("\n");
  const marker = rest.slice(0, newline);
  assert.ok(rest.slice(newline).startsWith("\n\n"), `a blank line follows the marker under ${heading}`);
  const content = rest.slice(newline + 2);
  return { marker, content: end ? content.slice(0, content.indexOf(end)) : content.trimEnd() };
}

if (LOCAL) {
  test(`${LOCAL}/llms.txt: marker under ## Blog; the snapshot equals the fixture`, async () => {
    const res = await get(`${LOCAL}/llms.txt`);
    assert.equal(res.status, 200);
    const { marker, content } = blogSection(res.body, "## Blog", "\n\n## API surface");
    assert.ok([LIVE_MARKER, SNAPSHOT_MARKER].includes(marker), `marker line is ${JSON.stringify(marker)}`);
    if (marker === SNAPSHOT_MARKER) {
      assert.equal(content, parseBlogIndex(INDEX_FIXTURE));
    } else {
      process.stdout.write("  (served from the live blog app: snapshot comparison not applicable)\n");
    }
  });

  test(`${LOCAL}/llms-full.txt: marker under # Blog; the snapshot equals the fixture`, async () => {
    const res = await get(`${LOCAL}/llms-full.txt`);
    assert.equal(res.status, 200);
    const { marker, content } = blogSection(res.body, "# Blog", null);
    assert.ok([LIVE_MARKER, SNAPSHOT_MARKER].includes(marker), `marker line is ${JSON.stringify(marker)}`);
    if (marker === SNAPSHOT_MARKER) {
      assert.equal(content, parseBlogCorpus(CORPUS_FIXTURE));
    } else {
      process.stdout.write("  (served from the live blog app: snapshot comparison not applicable)\n");
    }
  });

  test(`${LOCAL}: /raw/blog/<slug> is a 308 to /blog/<slug>.md, which still serves markdown`, async () => {
    for (const slug of ["launch", "works-with-any-ai", "gpt-live-seven-languages"]) {
      const raw = await get(`${LOCAL}/raw/blog/${slug}`);
      assert.equal(raw.status, 308, `/raw/blog/${slug}`);
      assert.equal(raw.headers.get("location"), `/blog/${slug}.md`);
      const md = await get(`${LOCAL}/blog/${slug}.md`);
      assert.equal(md.status, 200, `/blog/${slug}.md`);
      assert.match(md.headers.get("content-type") || "", /^text\/markdown/);
      assert.ok(md.body.startsWith("# "), `/blog/${slug}.md is markdown`);
    }
    // Docs raw URLs are not redirected.
    const docsRaw = await get(`${LOCAL}/raw/docs/quickstart`);
    assert.equal(docsRaw.status, 200);
  });
}

/* ----------------------------------------------------------------- runner */

let failed = 0;
for (const [name, body] of cases) {
  try {
    await body();
    process.stdout.write(`ok - ${name}\n`);
  } catch (error) {
    failed += 1;
    process.stdout.write(`not ok - ${name}\n  ${String(error?.stack || error).split("\n").join("\n  ")}\n`);
  }
}
process.stdout.write(`\n${cases.length - failed}/${cases.length} passed\n`);
process.exitCode = failed ? 1 : 0;
