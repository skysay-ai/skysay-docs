import metaJson from "../../content/docs/meta.json";

import { docsSlugToUrl, parseDocsSections } from "./docs-sections.js";
import { resolveDocsIcon } from "./docs-icons.jsx";

// The section tab row above the docs page tree (tabMode: "navbar" in
// src/app/docs/layout.jsx). One tab per content/docs/meta.json separator —
// Get started, Tutorials, Guides, Customer applications, MCP tools, API
// reference, Concepts, Agent surface — built from meta.json at module load
// instead of a hand-typed URL list, so a page added to (or moved within)
// meta.json cannot silently fall outside every tab's `urls` set.
//
// `url` is the section's first page, used when a tab itself is followed as a
// link. `urls` is every page URL in the section: fumadocs' `isLayoutTabActive`
// (fumadocs-ui/dist/layouts/shared/index.js) checks `tabs[i].urls.has(pathname)`
// first, which is what makes the active tab highlight correctly on every page
// in a section, not just its first one.
//
// `icon` reuses docs-icons.jsx's `resolveDocsIcon` — the same fail-closed
// resolver the sidebar page tree uses, and the exact icon names meta.json's
// separators already declare (Rocket, GraduationCap, Compass, AppWindow,
// Puzzle, CodeBrackets, LightBulb, Cpu). An unresolvable or missing icon name
// throws at build time here exactly as it does for the sidebar; this module
// does not weaken that contract.
//
// Known, accepted consequence: fumadocs only narrows the sidebar to a
// section when the active page sits inside a page-tree folder with
// `root: true` (fumadocs-ui's tree context). content/docs/ is a flat file
// list with meta.json separators, not folders, so these hand-written tabs do
// NOT shorten the sidebar. Folderising the content is a separate, later
// change.
export const docsSectionTabs = parseDocsSections(metaJson.pages).map((section) => {
  if (section.slugs.length === 0) {
    throw new Error(`docs-tabs: section "${section.title}" has no pages in meta.json`);
  }
  const urls = section.slugs.map(docsSlugToUrl);
  return {
    title: section.title,
    icon: resolveDocsIcon(section.icon),
    url: urls[0],
    urls: new Set(urls),
  };
});
