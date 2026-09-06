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
 * A gate is only worth having if it can fail, and a gate that fails on correct
 * pages gets switched off, so both directions are closed deliberately.
 *
 * It cannot pass without checking:
 *   - a truncated HTTP response REJECTS instead of resolving a partial body;
 *   - checking zero links is a FAILURE, not "all anchors resolve";
 * *   - the entry-point guard compares real paths, so running through a symlinked
 *     directory (`/tmp` -> `/private/tmp` on macOS) still runs it;
 *   - `<script>`/`<style>` contents are removed before anything is extracted.
 *     Next.js serializes the page into `self.__next_f.push(...)`, so a fenced
 *     code example containing `<div id='ghost'>` would otherwise be read as a
 *     real element and make a broken `#ghost` link pass.
 *
 * And it cannot fail on a page that works:
 *   - hrefs resolve as URLs against the page they appear on, so a link to this
 *     same site written scheme-absolute or relative is checked, not skipped;
 *   - in-site redirects are followed, because `next.config.mjs` keeps old URLs
 *     resolving (`/docs/agents` -> `/docs/mcp`) and a browser carries the
 *     fragment across them;
 *   - a redirect that supplies its own fragment REPLACES the incoming one, the
 *     way a browser resolves it;
 *   - the page list comes from the site's own sitemap, which is built from the
 *     Fumadocs loader's resolved URLs, so folder indexes, `(group)` directories
 *     and `.md` pages need no routing rules re-implemented here;
 *   - HTML character references are decoded exactly ONCE per path, so a link to
 *     the literal id `a&amp;b` stays distinct from one to `a&b`, and `&nbsp;`
 *     decodes to U+00A0 rather than a plain space;
 *   - percent-escapes are decoded run by run, so a literal `%` beside an escaped
 *     character (`#100%-caf%C3%A9`) does not defeat the whole fragment, and the
 *     LITERAL fragment is accepted too, because that is what a browser matches
 *     against an id first.
 *
 *   npm run start &            # or any running instance of this site
 *   npm run anchor-check
 *   node scripts/anchor-check.mjs --local http://127.0.0.1:3000
 */
import { realpathSync } from "node:fs";
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
const MAX_REDIRECTS = 5;
// The host `--local` names. A rendered page or a redirect may address the very
// server being checked by its absolute URL, and treating that as "off this
// site" fails a hop a browser would follow.
const LOCAL_HOST = (() => {
  try {
    return new URL(LOCAL).host;
  } catch {
    return "";
  }
})();

// The public hosts this site is served on. A rendered link that names one of
// them is an in-site anchor claim even though it is written scheme-absolute,
// and skipping it as "external" is how a broken fragment gets a pass.
// `next.config.mjs` keeps `openphonex.com` canonical and redirects `www`.
export const IN_SITE_HOSTS = new Set(["openphonex.com", "www.openphonex.com"]);

const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", "\u00a0"],
]);

// An attribute in the HTML source is a SERIALIZATION; the value a browser
// compares an anchor against is the decoded one. `## Custom [#a&b]` renders as
// `id="a&amp;b"` and is matched by `#a%26b`. This runs exactly once, at
// extraction: decoding a second time downstream would collapse the literal id
// `a&amp;b` (written `id="a&amp;amp;b"`) onto `a&b`.
export function decodeEntities(value) {
  return String(value ?? "").replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isInteger(code)) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES.get(body.toLowerCase());
    return named === undefined ? match : named;
  });
}

// Percent-escapes are decoded RUN BY RUN. `decodeURIComponent` on the whole
// fragment throws when a literal `%` sits beside a valid escape, and falling
// back to the raw string then compares `100%-caf%C3%A9` against the id
// `100%-café`. A browser decodes the valid escapes and leaves the rest.
export function decodeFragment(value) {
  return String(value ?? "").replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
}

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
        res.on("error", reject);
        res.on("aborted", () => reject(new Error(`connection closed before the body finished for ${url}`)));
        res.on("end", () => {
          // `complete` is false when the connection ended before the declared
          // body arrived. Resolving there would hand `main` a page missing the
          // ids it is about to look for.
          if (!res.complete) {
            reject(new Error(`incomplete response body for ${url}`));
            return;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(30_000, () => req.destroy(new Error(`timeout requesting ${url}`)));
    req.end();
  });
}

// The page list comes from the site's OWN sitemap, which `src/app/docs/sitemap.js`
// builds from `source.getPages()` -- the Fumadocs loader's resolved URLs. Deriving
// URLs from filenames here meant re-implementing the loader's routing, and it got
// three rules wrong in a row: a folder's `index.mdx` is served at the folder URL
// unless a sibling `guide.mdx` collides with it, `(group)` directories are
// dropped, and `.md` is a supported extension too. The loader already knows all
// of that; asking it is not a shortcut, it is the same reason ids are read from
// rendered HTML rather than re-slugged here.
export function sitemapPaths(xml) {
  const paths = [];
  for (const match of String(xml ?? "").matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const raw = decodeEntities(match[1].trim());
    let url;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    paths.push(url.pathname.replace(/\/$/, "") || "/");
  }
  return [...new Set(paths)].sort();
}

// Script and style contents are TEXT, not markup: nothing in them is an element
// a fragment can address. Next.js inlines the whole rendered page into
// `self.__next_f.push(...)`, so a documented `<div id='ghost'>` inside a fenced
// example appears there verbatim and would otherwise be extracted as an id.
// `<template>` content is inert too and cannot be an anchor target.
const NON_MARKUP_BLOCKS = /<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
export function markupOnly(html) {
  return String(html ?? "").replace(NON_MARKUP_BLOCKS, " ");
}

// `id="..."` on any element, not only headings: an anchor target is whatever
// carries the id, and fumadocs puts them on headings while generated reference
// blocks and hand-written components put them elsewhere. Single quotes are
// accepted because the attribute value, not the quoting style, is the contract.
const ID_PATTERN = /\sid=(?:"([^"]*)"|'([^']*)')/g;
export function idsIn(html) {
  return new Set([...markupOnly(html).matchAll(ID_PATTERN)].map((match) => decodeEntities(match[1] ?? match[2])));
}

// Hrefs come back as the RAW attribute text. `parseInSiteLink` decodes them,
// so the entity decoding on this path happens exactly once.
const HREF_PATTERN = /\shref=(?:"([^"]*)"|'([^']*)')/g;
export function hrefsIn(html) {
  return [...markupOnly(html).matchAll(HREF_PATTERN)].map((match) => match[1] ?? match[2]);
}

// The origin used to resolve relative and same-page links. It never leaves this
// process: only the resolved path is requested, from `--local`.
const RESOLUTION_ORIGIN = "http://anchor-check.invalid";

// This site answers on its public hosts, on whatever `--local` names, and on
// the placeholder origin used to resolve relative links.
function isInSiteHost(url, resolutionHost) {
  return url.host === resolutionHost || url.host === LOCAL_HOST || IN_SITE_HOSTS.has(url.hostname);
}

// A fragment is compared to the id EXACTLY: ids are case-sensitive in the DOM,
// and `%20`-style escapes have to be decoded first or a legitimate id with a
// non-ASCII character would read as broken.
export function parseInSiteLink(href, fromPage, origin = RESOLUTION_ORIGIN) {
  if (!href) return null;
  const decoded = decodeEntities(href);
  let url;
  try {
    url = new URL(decoded, `${origin}${fromPage}`);
  } catch {
    return null; // not a resolvable URL at all
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null; // mailto:, tel:, ...
  if (!isInSiteHost(url, new URL(origin).host)) return null; // genuinely external
  const rawFragment = url.hash.slice(1);
  if (!rawFragment) return null; // no fragment, or a bare "#" no-op link
  // Both spellings, because a browser matches the LITERAL fragment against ids
  // first and only then the percent-decoded one. An id may legitimately contain
  // a literal `%C3%A9`, and decoding unconditionally would fail that link.
  const fragment = decodeFragment(rawFragment);
  const targetPath = url.pathname.replace(/\/$/, "") || "/";
  // `.md`/`.txt` rewrites and asset routes serve plain text, which has no ids.
  if (/\.(md|txt|json|xml|png|svg|jpg|jpeg|webp|ico|css|js)$/i.test(targetPath)) return null;
  return { targetPath, fragment, rawFragment };
}

async function main() {
  const sitemap = await request(`${LOCAL}/docs/sitemap.xml`);
  if (sitemap.status !== 200) {
    throw new Error(`${LOCAL}/docs/sitemap.xml answered ${sitemap.status} — is \`npm run start\` running there?`);
  }
  const pages = sitemapPaths(sitemap.body);
  if (pages.length === 0) {
    throw new Error("the site's sitemap listed no pages");
  }
  // Deliberately no count check against `content/docs` here. Sitemap
  // completeness is `parity-check.mjs`'s job and it does it by PATH: it requests
  // the union of the content tree and the sitemap, so a page the sitemap forgets
  // is still visited there. A count comparison would be neither necessary (a
  // source file need not be a published page) nor sufficient (an extra generated
  // URL would mask a dropout).

  // Follow in-site redirects the way a browser does. `next.config.mjs` keeps
  // retired URLs resolving (`/docs/agents` -> `/docs/mcp`), and a browser carries
  // the fragment across the hop -- unless the Location supplies its own, which
  // then REPLACES it. Getting that backwards fails a working link and passes a
  // broken one.
  async function fetchPage(urlPath) {
    let current = urlPath;
    let fragmentOverride = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const { status, headers, body } = await request(`${LOCAL}${current}`);
      if (status === 200) return { html: body, finalPath: current, fragmentOverride, reason: null };
      const location = headers?.location;
      if (status >= 300 && status < 400 && location) {
        let next;
        try {
          next = new URL(location, `${LOCAL}${current}`);
        } catch {
          return { html: null, finalPath: current, fragmentOverride, reason: `redirected to an unparseable location (${location})` };
        }
        if (!isInSiteHost(next, LOCAL_HOST)) {
          return { html: null, finalPath: current, fragmentOverride, reason: `redirects off this site to ${location}` };
        }
        if (next.hash.length > 1) fragmentOverride = { raw: next.hash.slice(1), decoded: decodeFragment(next.hash.slice(1)) };
        current = `${next.pathname}${next.search}`;
        continue;
      }
      return {
        html: null,
        finalPath: current,
        fragmentOverride,
        reason: `answered ${status}${current === urlPath ? "" : ` at ${current}`}`,
      };
    }
    return { html: null, finalPath: current, fragmentOverride, reason: `more than ${MAX_REDIRECTS} redirects` };
  }

  const resultByPath = new Map();
  async function load(urlPath) {
    if (!resultByPath.has(urlPath)) resultByPath.set(urlPath, await fetchPage(urlPath));
    return resultByPath.get(urlPath);
  }

  const failures = [];
  let checked = 0;
  for (const page of pages) {
    const { html, reason } = await load(page);
    if (html === null) {
      failures.push(`${page}: ${reason} (is \`npm run start\` running on ${LOCAL}?)`);
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
      const target = await load(link.targetPath);
      if (target.html === null) {
        failures.push(`${page} -> ${key}: target page ${target.reason}`);
        continue;
      }
      // A redirect that supplies its own fragment REPLACES the one the link
      // carried; without one, the link's fragment is inherited across the hop.
      const effective = target.fragmentOverride?.decoded ?? link.fragment;
      const effectiveRaw = target.fragmentOverride?.raw ?? link.rawFragment;
      const ids = idsIn(target.html);
      if (!ids.has(effective) && !ids.has(effectiveRaw)) {
        const where =
          target.finalPath === link.targetPath
            ? link.targetPath
            : `${target.finalPath} (redirected from ${link.targetPath})`;
        failures.push(`${page} -> ${key}: no element with id="${effective}" on ${where}`);
      }
    }
    process.stdout.write(`.`);
  }
  process.stdout.write("\n");

  // Every page in this site links to another section of it, so zero checked
  // links means the extractor matched nothing -- a changed markup shape, a
  // server answering something that is not this site -- and reporting "all
  // anchors resolve" would be the exact false pass this gate exists to prevent.
  if (checked === 0) {
    failures.push(
      `no in-site anchor links found across ${pages.length} pages — the link extractor matched nothing, ` +
        `so nothing was verified`,
    );
  }

  console.log(`${pages.length} pages, ${checked} distinct in-site anchor links checked against the built pages' ids.`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} BROKEN ANCHOR${failures.length === 1 ? "" : "S"}:`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("All in-site anchors resolve.");
}

// Compare REAL paths. `import.meta.url` is already the resolved realpath, while
// `process.argv[1]` is whatever the caller typed, so on macOS an invocation
// through `/tmp` (a symlink to `/private/tmp`) made this comparison false and
// the whole gate exited 0 without running.
function realPath(candidate) {
  try {
    return realpathSync(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

if (process.argv[1] && realPath(process.argv[1]) === realPath(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
