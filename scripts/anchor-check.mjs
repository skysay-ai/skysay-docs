#!/usr/bin/env node
/**
 * In-site anchor gate.
 *
 * A link like `[Choose a delivery profile](/docs/delivery-profiles#set-it-on-an-agent)`
 * fails silently: the page loads, the browser finds no element with that id, and
 * the reader lands at the top of a long page with no indication anything went
 * wrong. Renaming one heading breaks every link that pointed at it, in files
 * nobody touched. That is exactly what happened to the delivery-profiles page --
 * `## Set it on an agent` became `## Set it through the API`, and the changelog
 * entry pointing at the old slug was left behind.
 *
 * This resolves every in-site `#fragment` link against the ids the BUILT pages
 * actually carry, rather than against slugs derived from the MDX source. Two
 * reasons that matters:
 *
 *   1. The heading id is produced by the site's own MDX pipeline (fumadocs'
 *      rehype slugger). Re-implementing its rules here would make this check
 *      agree with an assumption instead of with the page a reader opens, and it
 *      would need `github-slugger`, which is only a transitive dependency.
 *   2. Ids can come from anywhere -- a component, an explicit `id=`, a
 *      generated API reference block -- not only from a Markdown heading.
 *
 * Both the links and the ids are read from the rendered HTML for the same
 * reason, so a link a component emits is checked like any other.
 *
 *   npm run start &            # or any running instance of this site
 *   npm run anchor-check
 *   node scripts/anchor-check.mjs --local http://127.0.0.1:3000
 */
import { readdir } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function flag(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
}
const LOCAL = (flag("local", "http://127.0.0.1:3000") || "").replace(/\/$/, "");

function request(url) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === "https:" ? https : http;
    const req = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: "GET",
        headers: { "user-agent": "openphonex-docs-anchor-check/1.0", accept: "text/html" },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    req.setTimeout(30_000, () => req.destroy(new Error(`timeout requesting ${url}`)));
    req.end();
  });
}

/** Every `/docs/**.mdx` page this site owns, as a URL path. */
async function docPages() {
  const base = path.join(ROOT, "content", "docs");
  const entries = await readdir(base, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
    .map((entry) => {
      const relative = path.relative(base, path.join(entry.parentPath ?? entry.path, entry.name));
      const slug = relative.replace(/\.mdx$/, "").split(path.sep).join("/");
      return slug === "index" ? "/docs" : `/docs/${slug}`;
    })
    .sort();
}

// `id="..."` on any element, not only headings: an anchor target is whatever
// carries the id, and fumadocs puts them on headings while generated reference
// blocks and hand-written components put them elsewhere.
const ID_PATTERN = /\sid="([^"]+)"/g;
export function idsIn(html) {
  return new Set([...html.matchAll(ID_PATTERN)].map((match) => match[1]));
}

// Only in-site, same-origin document links with a fragment. External links,
// bare `#top` style same-page jumps (checked against the page's own ids), and
// non-document targets are handled by the caller.
const HREF_PATTERN = /\shref="([^"]+)"/g;
export function hrefsIn(html) {
  return [...html.matchAll(HREF_PATTERN)].map((match) => match[1]);
}

// A fragment is compared to the id EXACTLY: ids are case-sensitive in the DOM,
// and `%20`-style escapes have to be decoded first or a legitimate id with a
// non-ASCII character would read as broken.
export function parseInSiteLink(href, fromPage) {
  if (!href || !href.includes("#")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("/")) return null; // http:, mailto:, ...
  if (href.startsWith("//")) return null;
  const [rawPath, ...rest] = href.split("#");
  const rawFragment = rest.join("#");
  if (!rawFragment) return null; // bare "#" — a no-op link, not an anchor claim
  let fragment;
  try {
    fragment = decodeURIComponent(rawFragment);
  } catch {
    fragment = rawFragment;
  }
  const targetPath = (rawPath || fromPage).split("?")[0].replace(/\/$/, "") || "/";
  if (!targetPath.startsWith("/")) return null; // a relative link this site does not use
  // `.md`/`.txt` rewrites and asset routes serve plain text, which has no ids.
  if (/\.(md|txt|json|xml|png|svg|jpg|jpeg|webp|ico|css|js)$/i.test(targetPath)) return null;
  return { targetPath, fragment };
}

async function main() {
  const pages = await docPages();
  if (pages.length === 0) {
    throw new Error("no content/docs/**.mdx pages found — is this the docs repository root?");
  }

  const htmlByPath = new Map();
  async function load(urlPath) {
    if (htmlByPath.has(urlPath)) return htmlByPath.get(urlPath);
    const { status, body } = await request(`${LOCAL}${urlPath}`);
    const value = status === 200 ? body : null;
    htmlByPath.set(urlPath, value);
    return value;
  }

  const failures = [];
  let checked = 0;
  for (const page of pages) {
    const html = await load(page);
    if (html === null) {
      failures.push(`${page}: page did not answer 200 (is \`npm run start\` running on ${LOCAL}?)`);
      continue;
    }
    const seen = new Set();
    for (const href of hrefsIn(html)) {
      const link = parseInSiteLink(href, page);
      if (!link) continue;
      const key = `${link.targetPath}#${link.fragment}`;
      if (seen.has(key)) continue;
      seen.add(key);
      checked += 1;
      const targetHtml = await load(link.targetPath);
      if (targetHtml === null) {
        failures.push(`${page} -> ${key}: target page did not answer 200`);
        continue;
      }
      if (!idsIn(targetHtml).has(link.fragment)) {
        failures.push(`${page} -> ${key}: no element with id="${link.fragment}" on ${link.targetPath}`);
      }
    }
    process.stdout.write(`.`);
  }
  process.stdout.write("\n");

  console.log(`${pages.length} pages, ${checked} distinct in-site anchor links checked against the built pages' ids.`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} BROKEN ANCHOR${failures.length === 1 ? "" : "S"}:`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("All in-site anchors resolve.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
