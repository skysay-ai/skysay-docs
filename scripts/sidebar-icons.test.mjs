#!/usr/bin/env node
/**
 * Tests for the docs sidebar icon contract: content/docs/meta.json's section
 * separators, every content/docs/*.mdx page's `icon` frontmatter, and the
 * resolver map in src/lib/docs-icons.jsx.
 *
 * src/lib/docs-icons.jsx is a .jsx file (it returns JSX from
 * `resolveDocsIcon`), so plain `node` cannot `import` it directly — there is
 * no JSX loader registered in this repo, and adding one just for a test
 * would be a new dependency. Instead this reads it as TEXT and extracts the
 * `const ICONS = { ... }` block by regex, the same way anchor-check.mjs reads
 * HTML by regex instead of pulling in a DOM. `iconoir-react` itself ships
 * pre-compiled ESM (no JSX in the published package), so it imports directly
 * and its export names are the ground truth for "is this a real icon".
 *
 *   node scripts/sidebar-icons.test.mjs
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const META_PATH = path.join(ROOT, "content/docs/meta.json");
const DOCS_ICONS_PATH = path.join(ROOT, "src/lib/docs-icons.jsx");
const DOCS_DIR = path.join(ROOT, "content/docs");

const cases = [];
function test(name, body) {
  cases.push([name, body]);
}

/* --------------------------------------------------------------- parsing */

// Same shape fumadocs-core uses for a meta.json separator string (see
// node_modules/fumadocs-core/dist/loader-*.js): `---[Icon]Title---` or a
// bare `---Title---` with no icon at all.
const SEPARATOR = /^---(?:\[(?<icon>[^\]]+)])?(?<name>.+)---$/;

export function parseMetaIcons(meta) {
  const separators = [];
  const pageSlugs = [];
  for (const item of meta.pages) {
    const m = SEPARATOR.exec(item);
    if (m) {
      separators.push({ title: m.groups.name, icon: m.groups.icon });
    } else {
      pageSlugs.push(item);
    }
  }
  return { rootIcon: meta.icon, separators, pageSlugs };
}

export function parseFrontmatterIcon(mdxSource) {
  const fm = mdxSource.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return undefined;
  const line = fm[1].split("\n").find((l) => l.startsWith("icon:"));
  return line ? line.slice("icon:".length).trim() : undefined;
}

// Extracts the identifier keys of `const ICONS = { ... };` in docs-icons.jsx,
// skipping blank lines and `//` comments. Every key is a bare shorthand
// property (`Name,`), never `key: value` or a spread, so a plain per-line
// split is exact for this file rather than a regex-over-everything gamble.
export function parseIconMapNames(source) {
  const match = source.match(/const ICONS = \{([\s\S]*?)\n\};/);
  if (!match) {
    throw new Error("docs-icons.jsx: could not find `const ICONS = { ... };`");
  }
  const names = [];
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;
    const name = line.replace(/,$/, "").trim();
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
      throw new Error(`docs-icons.jsx ICONS map: unparseable entry ${JSON.stringify(rawLine)}`);
    }
    names.push(name);
  }
  return names;
}

/* -------------------------------------------------------------- fixtures */

const metaRaw = JSON.parse(readFileSync(META_PATH, "utf8"));
const { rootIcon, separators, pageSlugs } = parseMetaIcons(metaRaw);
const mapNames = parseIconMapNames(readFileSync(DOCS_ICONS_PATH, "utf8"));
const mapNameSet = new Set(mapNames);

const pages = pageSlugs.map((slug) => {
  const filePath = path.join(DOCS_DIR, `${slug}.mdx`);
  const source = readFileSync(filePath, "utf8");
  return { slug, icon: parseFrontmatterIcon(source) };
});

const iconoirExportsPromise = import("iconoir-react").then((m) => new Set(Object.keys(m)));

/* ------------------------------------------------------------------ gate */

test("meta.json lists every .mdx file in content/docs/, and nothing extra", () => {
  const onDisk = readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.slice(0, -".mdx".length))
    .sort();
  assert.deepEqual([...pageSlugs].sort(), onDisk);
});

test("the ICONS map has no accidental duplicate keys", () => {
  assert.equal(mapNames.length, mapNameSet.size, `duplicate keys in docs-icons.jsx ICONS map: ${mapNames.join(", ")}`);
});

test("every ICONS map entry is a real iconoir-react export", async () => {
  const iconoirExports = await iconoirExportsPromise;
  const unknown = mapNames.filter((n) => !iconoirExports.has(n));
  assert.deepEqual(unknown, [], `docs-icons.jsx imports names iconoir-react does not export: ${unknown.join(", ")}`);
});

test("content/docs/meta.json declares a top-level icon (the invisible global-root folder node)", () => {
  assert.ok(rootIcon, "meta.json needs a top-level \"icon\" — see the comment above ICONS.Book in docs-icons.jsx");
  assert.ok(mapNameSet.has(rootIcon), `meta.json's top-level icon "${rootIcon}" is not in the ICONS map`);
});

test("every separator carries an icon that resolves in the map", () => {
  const missing = separators.filter((s) => !s.icon).map((s) => s.title);
  assert.deepEqual(missing, [], `separators with no [Icon] prefix: ${missing.join(", ")}`);
  const unknown = separators.filter((s) => s.icon && !mapNameSet.has(s.icon));
  assert.deepEqual(
    unknown,
    [],
    `separator icons missing from the map: ${unknown.map((s) => `${s.title}=${s.icon}`).join(", ")}`,
  );
});

test("separator icons are unique", () => {
  const icons = separators.map((s) => s.icon);
  assert.equal(new Set(icons).size, icons.length, `duplicate separator icons: ${icons.join(", ")}`);
});

test("every docs page has an icon frontmatter field", () => {
  const missing = pages.filter((p) => !p.icon).map((p) => p.slug);
  assert.deepEqual(missing, [], `pages with no icon frontmatter: ${missing.join(", ")}`);
});

test("every page icon resolves in the map", () => {
  const unknown = pages.filter((p) => p.icon && !mapNameSet.has(p.icon));
  assert.deepEqual(
    unknown,
    [],
    `page icons missing from the map: ${unknown.map((p) => `${p.slug}=${p.icon}`).join(", ")}`,
  );
});

test("page icons are unique across the whole docs tree", () => {
  const icons = pages.map((p) => p.icon);
  assert.equal(new Set(icons).size, icons.length, `duplicate page icons: ${icons.join(", ")}`);
});

test("a separator never reuses a page's icon", () => {
  const pageIconSet = new Set(pages.map((p) => p.icon));
  const reused = separators.filter((s) => s.icon && pageIconSet.has(s.icon));
  assert.deepEqual(
    reused,
    [],
    `separators reusing a page icon: ${reused.map((s) => `${s.title}=${s.icon}`).join(", ")}`,
  );
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
