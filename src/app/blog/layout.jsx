import { HomeLayout } from "fumadocs-ui/layouts/home";
import { RootProvider } from "fumadocs-ui/provider/next";

import { baseLinks, baseNavOptions } from "@/lib/docs-layout.config";

// Blog shares the Fumadocs theme + chrome with /docs (Blueprint), but uses the
// simpler top-nav Home layout instead of the docs sidebar. next-themes stays
// disabled so it never fights the root's forced dark class.
export default function BlogRootLayout({ children }) {
  return (
    <RootProvider theme={{ enabled: false }}>
      {/* Same reasoning as src/app/docs/layout.jsx: RootProvider's theme
          integration is disabled and the root forces dark mode, so a theme
          toggle here would render but do nothing. */}
      <HomeLayout nav={baseNavOptions} links={baseLinks} themeSwitch={{ enabled: false }}>
        {children}
      </HomeLayout>
    </RootProvider>
  );
}
