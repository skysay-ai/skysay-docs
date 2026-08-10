import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";

import { baseLinks, baseNavOptions } from "@/lib/docs-layout.config";
import { source } from "@/lib/source";

// Nested layout under the root src/app/layout.jsx (which owns
// <html className="dark">). Fumadocs owns only the /docs subtree here.
// next-themes is disabled so it never fights the root's forced dark class
// (Blueprint theme in src/styles.css).
export default function DocsRootLayout({ children }) {
  return (
    <RootProvider theme={{ enabled: false }}>
      <DocsLayout tree={source.pageTree} nav={baseNavOptions} links={baseLinks}>
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
