#!/usr/bin/env node
/**
 * URL parity gate for the docs migration.
 *
 * Enumerates every URL this app owns and compares it against the currently
 * live site, asserting status, <title> and first <h1> match. The URL list is
 * the UNION of three sources so a page that was never ported still shows up:
 *
 *   1. the local content tree (content/docs/**.mdx, content/blog/**.mdx)
 *   2. this app's own sitemap (/docs/sitemap.xml)
 *   3. the live site's sitemap, filtered to the prefixes this app serves
 *
 * Also checks the redirect, the rewrites that back the `.md` URLs, the two
 * llms corpora (byte-diffed against live), search, and the www canonical host.
 *
 * Usage:
 *   node scripts/parity-check.mjs
 *   node scripts/parity-check.mjs --local http://127.0.0.1:3000 --live https://openphonex.com
 *   node scripts/parity-check.mjs --no-live      # local-only assertions
 *   node scripts/parity-check.mjs --json report.json
 */
import { readdir } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}
const LOCAL = (flag("local", "http://127.0.0.1:3000") || "").replace(/\/$/, "");
const LIVE = (flag("live", "https://openphonex.com") || "").replace(/\/$/, "");
const CHECK_LIVE = !args.includes("--no-live");
const JSON_OUT = flag("json", null);

const results = [];
function record(check, target, ok, detail) {
  results.push({ check, target, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  process.stdout.write(`${mark.padEnd(4)}  ${check.padEnd(22)}  ${target}${detail ? `  — ${detail}` : ""}\n`);
}

// --------------------------------------------------------------------------
// HTTP
// --------------------------------------------------------------------------

/** Raw request so we can set a Host header (undici forbids overriding it). */
function request(url, { host, method = "GET", redirect = "follow", depth = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "https:" ? https : http;
    const headers = { "user-agent": "openphonex-docs-parity/1.0", accept: "*/*" };
    if (host) headers.host = host;
    const req = mod.request(
      { protocol: u.protocol, hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode;
          const location = res.headers.location ?? null;
          if (redirect === "follow" && location && status >= 300 && status < 400 && depth < 5) {
            const next = new URL(location, url).toString();
            resolve(request(next, { host, method, redirect, depth: depth + 1 }));
            return;
          }
          resolve({ status, headers: res.headers, body, url });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

// --------------------------------------------------------------------------
// HTML helpers
// --------------------------------------------------------------------------

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function textOf(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function titleOf(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? textOf(m[1]) : null;
}

function firstHeadingOf(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? textOf(m[1]) : null;
}

// --------------------------------------------------------------------------
// URL enumeration
// --------------------------------------------------------------------------

async function mdxSlugs(dir) {
  const out = [];
  async function walk(current, prefix) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(path.join(current, entry.name), [...prefix, entry.name]);
      } else if (entry.name.endsWith(".mdx")) {
        const base = entry.name.replace(/\.mdx$/, "");
        out.push(base === "index" ? prefix : [...prefix, base]);
      }
    }
  }
  await walk(dir, []);
  return out;
}

function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1]));
}

// The live root sitemap is a <urlset> today, but becomes a <sitemapindex> once
// SCH-334's private-side PR deploys (that app stops listing docs URLs directly
// and points at this app's /docs/sitemap.xml instead). <loc> means a child
// sitemap in an index and a page in a urlset, so resolve one level of
// indirection rather than silently comparing pages against sitemap URLs — which
// would report every docs page as "not in live sitemap".
async function livePageUrls(rootUrl) {
  const root = await request(rootUrl);
  if (root.status !== 200) return [];
  if (!/<sitemapindex[\s>]/i.test(root.body)) return sitemapUrls(root.body);
  const pages = [];
  for (const child of sitemapUrls(root.body)) {
    const res = await request(child);
    if (res.status === 200) pages.push(...sitemapUrls(res.body));
  }
  return pages;
}

function pathOf(url) {
  try {
    return new URL(url).pathname.replace(/\/$/, "") || "/";
  } catch {
    return url;
  }
}

const OWNED_PREFIXES = ["/docs", "/blog"];
function isOwned(p) {
  return OWNED_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

// --------------------------------------------------------------------------
// Checks
// --------------------------------------------------------------------------

async function comparePage(p) {
  const local = await request(`${LOCAL}${p}`);
  const localTitle = titleOf(local.body);
  const localHeading = firstHeadingOf(local.body);

  if (local.status !== 200) {
    record("page", p, false, `local status ${local.status}`);
    return;
  }
  if (!localTitle) {
    record("page", p, false, "local page has no <title>");
    return;
  }

  if (!CHECK_LIVE) {
    record("page", p, true, `title="${localTitle}" h1="${localHeading}"`);
    return;
  }

  const live = await request(`${LIVE}${p}`);
  const liveTitle = titleOf(live.body);
  const liveHeading = firstHeadingOf(live.body);
  const problems = [];
  if (live.status !== local.status) problems.push(`status ${local.status} vs live ${live.status}`);
  if (liveTitle !== localTitle) problems.push(`title "${localTitle}" vs live "${liveTitle}"`);
  if (liveHeading !== localHeading) problems.push(`h1 "${localHeading}" vs live "${liveHeading}"`);
  record("page", p, problems.length === 0, problems.join("; ") || `200 · "${localTitle}"`);
}

async function compareRaw(p) {
  const local = await request(`${LOCAL}${p}`);
  const problems = [];
  if (local.status !== 200) problems.push(`local status ${local.status}`);
  const ctype = String(local.headers["content-type"] || "");
  if (!ctype.startsWith("text/markdown")) problems.push(`local content-type ${ctype}`);
  if (local.body.trim().length === 0) problems.push("local body empty");

  if (CHECK_LIVE) {
    const live = await request(`${LIVE}${p}`);
    if (live.status !== local.status) problems.push(`status ${local.status} vs live ${live.status}`);
    if (live.body !== local.body) {
      problems.push(`body differs (local ${local.body.length}B vs live ${live.body.length}B)`);
    }
  }
  record("raw-markdown", p, problems.length === 0, problems.join("; ") || `${local.body.length}B markdown`);
}

function firstDiff(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i += 1) {
    if (la[i] !== lb[i]) {
      return `line ${i + 1}: local ${JSON.stringify((la[i] ?? "").slice(0, 90))} vs live ${JSON.stringify((lb[i] ?? "").slice(0, 90))}`;
    }
  }
  return null;
}

async function compareCorpus(p, mustContain) {
  const local = await request(`${LOCAL}${p}`);
  const problems = [];
  if (local.status !== 200) problems.push(`local status ${local.status}`);
  for (const needle of mustContain) {
    if (!local.body.includes(needle)) problems.push(`local corpus missing ${JSON.stringify(needle)}`);
  }
  let detail = `${local.body.length}B`;
  if (CHECK_LIVE) {
    const live = await request(`${LIVE}${p}`);
    if (live.status !== local.status) problems.push(`status ${local.status} vs live ${live.status}`);
    if (live.body !== local.body) {
      const d = firstDiff(local.body, live.body);
      problems.push(`body differs (local ${local.body.length}B vs live ${live.body.length}B) — ${d}`);
    } else {
      detail = `${local.body.length}B, byte-identical to live`;
    }
  }
  record("corpus", p, problems.length === 0, problems.join("; ") || detail);
}

async function main() {
  const docsSlugs = await mdxSlugs(path.join(ROOT, "content/docs"));
  const blogSlugs = await mdxSlugs(path.join(ROOT, "content/blog"));

  const docPaths = docsSlugs.map((s) => (s.length ? `/docs/${s.join("/")}` : "/docs"));
  const blogPaths = blogSlugs.map((s) => `/blog/${s.join("/")}`);

  // Local sitemap
  const localSitemap = await request(`${LOCAL}/docs/sitemap.xml`);
  const localSitemapPaths = new Set(sitemapUrls(localSitemap.body).map(pathOf));

  // Live sitemap, filtered to the prefixes this app serves.
  let liveOwnedPaths = [];
  if (CHECK_LIVE) {
    liveOwnedPaths = (await livePageUrls(`${LIVE}/sitemap.xml`)).map(pathOf).filter(isOwned);
  }

  const allPages = [...new Set([...docPaths, "/blog", ...blogPaths, ...liveOwnedPaths, ...localSitemapPaths])].sort();

  process.stdout.write(`\nParity: local=${LOCAL} live=${CHECK_LIVE ? LIVE : "(skipped)"}\n`);
  process.stdout.write(`${allPages.length} page URLs under /docs and /blog\n\n`);

  for (const p of allPages) {
    await comparePage(p);
  }

  // The permanent redirect. Next emits 308 for `permanent: true`; that is what
  // the live site returns today, so 308 is the parity target (not 301).
  {
    const local = await request(`${LOCAL}/docs/agents`, { redirect: "manual" });
    const problems = [];
    if (local.status !== 308) problems.push(`local status ${local.status} (expected 308)`);
    if (pathOf(new URL(local.headers.location || "/", LOCAL).toString()) !== "/docs/mcp") {
      problems.push(`local location ${local.headers.location}`);
    }
    if (CHECK_LIVE) {
      const live = await request(`${LIVE}/docs/agents`, { redirect: "manual" });
      if (live.status !== local.status) problems.push(`status ${local.status} vs live ${live.status}`);
      if (pathOf(new URL(live.headers.location || "/", LIVE).toString()) !== "/docs/mcp") {
        problems.push(`live location ${live.headers.location}`);
      }
    }
    record("redirect", "/docs/agents", problems.length === 0, problems.join("; ") || "308 -> /docs/mcp");
  }

  // The www canonical-host redirect must fire before route handling and must
  // preserve the full path AND query string.
  {
    const target = "/docs/mcp?x=1&y=2";
    const res = await request(`${LOCAL}${target}`, { host: "www.openphonex.com", redirect: "manual" });
    const problems = [];
    if (res.status !== 301) problems.push(`status ${res.status} (expected 301)`);
    if (res.headers.location !== `https://openphonex.com${target}`) {
      problems.push(`location ${res.headers.location} (expected https://openphonex.com${target})`);
    }
    record("www-canonical", target, problems.length === 0, problems.join("; ") || `301 -> ${res.headers.location}`);
  }

  // Per-page raw markdown, both corpora.
  for (const p of docPaths) {
    await compareRaw(`${p}.md`);
  }
  for (const p of blogPaths) {
    await compareRaw(`${p}.md`);
  }

  // llms.txt / llms-full.txt. /llms-full.txt must carry BOTH corpora.
  await compareCorpus("/llms.txt", ["## Docs", "## Blog"]);
  await compareCorpus("/llms-full.txt", ["# Documentation", "# Blog"]);
  {
    const full = await request(`${LOCAL}/llms-full.txt`);
    const missing = [...docPaths, ...blogPaths].filter((p) => !full.body.includes(`URL: ${p}\n`));
    record(
      "corpus-coverage",
      "/llms-full.txt",
      missing.length === 0,
      missing.length ? `missing ${missing.join(", ")}` : `all ${docPaths.length} docs + ${blogPaths.length} blog pages present`,
    );
  }

  // Search.
  {
    const local = await request(`${LOCAL}/api/search?query=webhook`);
    let hits = [];
    try {
      hits = JSON.parse(local.body);
    } catch {
      /* handled below */
    }
    const problems = [];
    if (local.status !== 200) problems.push(`local status ${local.status}`);
    if (!Array.isArray(hits) || hits.length === 0) problems.push("local returned no results for 'webhook'");
    if (CHECK_LIVE) {
      const live = await request(`${LIVE}/api/search?query=webhook`);
      let liveHits = [];
      try {
        liveHits = JSON.parse(live.body);
      } catch {
        /* handled below */
      }
      if (!Array.isArray(liveHits) || liveHits.length === 0) problems.push("live returned no results");
      else if (Array.isArray(hits) && hits.length !== liveHits.length) {
        problems.push(`${hits.length} results vs live ${liveHits.length}`);
      }
    }
    record("search", "/api/search?query=webhook", problems.length === 0, problems.join("; ") || `${hits.length} results`);
  }

  // Sitemap coverage: every page URL this app owns must be listed.
  {
    const problems = [];
    if (localSitemap.status !== 200) problems.push(`status ${localSitemap.status}`);
    const missing = allPages.filter((p) => !localSitemapPaths.has(p));
    if (missing.length) problems.push(`missing ${missing.join(", ")}`);
    if (CHECK_LIVE) {
      const notLive = [...localSitemapPaths].filter((p) => isOwned(p) && !liveOwnedPaths.includes(p));
      if (notLive.length) problems.push(`not in live sitemap: ${notLive.join(", ")}`);
    }
    record(
      "sitemap",
      "/docs/sitemap.xml",
      problems.length === 0,
      problems.join("; ") || `${localSitemapPaths.size} URLs, covers all ${allPages.length} pages`,
    );
  }

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
  if (failed.length) {
    process.stdout.write(`\nFailures:\n`);
    for (const f of failed) process.stdout.write(`  ${f.check} ${f.target}: ${f.detail}\n`);
  }
  if (JSON_OUT) {
    await writeFile(JSON_OUT, JSON.stringify({ local: LOCAL, live: CHECK_LIVE ? LIVE : null, results }, null, 2));
    process.stdout.write(`\nwrote ${JSON_OUT}\n`);
  }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
