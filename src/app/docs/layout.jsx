import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import { RootProvider } from "fumadocs-ui/provider/next";

import { baseLinks, baseNavOptions } from "@/lib/docs-layout.config";
import { docsSectionTabs } from "@/lib/docs-tabs.jsx";
import { source } from "@/lib/source";

// Nested layout under the root src/app/layout.jsx (which owns
// <html className="dark">). Fumadocs owns only the /docs subtree here.
// next-themes is disabled so it never fights the root's forced dark class
// (Blueprint theme in src/styles.css).
//
// This uses fumadocs-ui's "notebook" DocsLayout, not the plain "docs" one:
// the plain layout renders Home/Blog/Pricing/API/llms.txt/Start (`links`)
// stacked inside the left sidebar, with no horizontal bar anywhere. The
// notebook layout's header slot renders the same `links` horizontally on
// desktop (`fumadocs-ui/dist/layouts/notebook/slots/header.js`) and falls
// back to rendering them inside the sidebar/drawer only below the `lg`
// breakpoint (`.../slots/sidebar.js`), so mobile reachability is unchanged.
//
// `nav.mode: "top"` (vs. the default "auto") keeps the "OpenPhonex / Docs"
// brand block and the sidebar-collapse control always in the header row. In
// "auto" mode that block only appears in the header once the sidebar is
// collapsed on desktop, living in the sidebar the rest of the time — with a
// tab row already occupying the header's second row, "top" reads as one
// consistent top bar instead of the brand jumping between two places.
//
// `tabMode: "navbar"` + `tabs` add the section tab row (Get started,
// Tutorials, Guides, ...) below the links. See src/lib/docs-tabs.jsx for how
// the tabs and their active-page URL sets are derived from
// content/docs/meta.json. Accepted consequence: because content/docs/ is a
// flat file list (not page-tree folders with `root: true`), these
// hand-written tabs do not narrow the sidebar to the active section —
// folderising the content is a separate, later change.
export default function DocsRootLayout({ children }) {
  return (
    <RootProvider theme={{ enabled: false }}>
      <DocsLayout
        tree={source.pageTree}
        nav={{ ...baseNavOptions, mode: "top" }}
        links={baseLinks}
        tabMode="navbar"
        tabs={docsSectionTabs}
        // The theme toggle has nothing to switch: the root layout forces
        // dark mode (`<html className="dark">`) and RootProvider's theme
        // integration is disabled above, so next-themes never runs. Left at
        // its default, the notebook header renders a toggle that does
        // nothing when clicked.
        themeSwitch={{ enabled: false }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
