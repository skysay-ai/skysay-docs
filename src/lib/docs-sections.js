// Groups content/docs/meta.json's flat `pages` array into the sections its
// "---[Icon]Title---" separators define. Plain JS (no JSX) on purpose: this
// is imported both by src/lib/docs-tabs.jsx (production, wraps each section
// into a fumadocs LayoutTab with a resolved icon) and by
// scripts/docs-tabs.test.mjs (a plain Node ESM script — see
// scripts/sidebar-icons.test.mjs's header for why a .jsx file can't be
// imported directly there). Keeping the parsing logic in one plain module
// means both call sites run the exact same grouping, not two hand-copies
// that could drift.
//
// Same separator shape fumadocs-core's page-tree loader parses (see
// node_modules/fumadocs-core/dist/loader-*.js and the identical regex in
// scripts/sidebar-icons.test.mjs): `---[Icon]Title---` or a bare
// `---Title---` with no icon at all.
const SEPARATOR = /^---(?:\[(?<icon>[^\]]+)])?(?<name>.+)---$/;

/**
 * @param {string[]} pages content/docs/meta.json's `pages` array.
 * @returns {{ title: string, icon: string | undefined, slugs: string[] }[]}
 */
export function parseDocsSections(pages) {
  const sections = [];
  let current = null;
  for (const item of pages) {
    const match = SEPARATOR.exec(item);
    if (match) {
      current = { title: match.groups.name, icon: match.groups.icon, slugs: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      throw new Error(
        `docs-sections: page "${item}" appears before any "---[Icon]Title---" separator in meta.json`,
      );
    }
    current.slugs.push(item);
  }
  return sections;
}

// fumadocs treats content/docs/index.mdx as the section root: its page URL
// is the bare baseUrl ("/docs"), never "/docs/index" (confirmed by
// src/app/docs/sitemap.js's own `page.url === "/docs"` check for the index
// page). Every other slug is "/docs/<slug>".
export function docsSlugToUrl(slug) {
  return slug === "index" ? "/docs" : `/docs/${slug}`;
}
