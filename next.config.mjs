import { fileURLToPath } from "node:url";

import { createMDX } from "fumadocs-mdx/next";

const root = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Both this app and the private web app sit on skysay.ai behind
  // path-based ingress, and BOTH emit /_next/static/*. That path cannot be
  // routed by prefix without breaking one of them, so this app's assets are
  // published under /docs-assets, which ingress routes here while stripping
  // the prefix (no preserve_path_prefix) so Next receives the /_next/... path
  // it actually serves. Without this the pages render unstyled: the browser
  // requests /_next/static/... and gets the OTHER app's build.
  assetPrefix: "/docs-assets",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // The local app should present product feedback, not Next.js implementation
  // status. Runtime/build errors still surface normally in the error overlay.
  devIndicators: false,
  poweredByHeader: false,
  turbopack: {
    root,
  },
  // This app is pure JS. Fumadocs ships a generated TypeScript `.source`, so
  // `next build` would otherwise run a whole-project type-check against untyped
  // .js/.jsx files and fail. tsconfig.json keeps checkJs off; this makes the
  // build never gate on TS regardless.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Next emits `s-maxage=31536000` on statically prerendered pages, which
  // assumes the hosting platform purges its CDN on every deploy. DigitalOcean
  // App Platform behind Cloudflare does not, so that default meant a published
  // docs change could sit behind a year-old edge copy — defeating the whole
  // point of deploying on push.
  //
  // Assets are excluded and keep Next's `max-age=31536000, immutable`: their
  // filenames are content-hashed, so caching them forever is correct and is
  // what makes the short HTML TTL cheap.
  async headers() {
    return [
      {
        source: "/((?!docs-assets|_next).*)",
        headers: [
          ...(/^[0-9a-f]{40}$/.test(process.env.OPENPHONEX_DOCS_REVISION || "")
            ? [{ key: "X-OpenPhonex-Docs-Revision", value: process.env.OPENPHONEX_DOCS_REVISION }]
            : []),
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Keep one canonical host for search engines and shared links. On
      // skysay.ai the path-based ingress rules route the docs prefixes to
      // this app on BOTH hostnames, so the www -> apex redirect has to exist
      // here too or www.skysay.ai/docs would answer 200 at a
      // non-canonical host and split indexing.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.skysay.ai" }],
        destination: "https://skysay.ai/:path*",
        statusCode: 301,
      },
      // The old /docs/agents stub is superseded by the Fumadocs /docs tree.
      // Its content (MCP endpoint, OpenAPI/llms.txt links, scoped keys) now
      // lives in the "MCP tools" + "Authentication & keys" pages. Keep the
      // old URL resolving.
      { source: "/docs/agents", destination: "/docs/mcp", permanent: true },
    ];
  },
  async rewrites() {
    return [
      // Per-page agent-readable markdown: /docs/quickstart.md and
      // /blog/launch.md serve the raw processed markdown.
      { source: "/docs/:path*.md", destination: "/raw/docs/:path*" },
      { source: "/blog/:path*.md", destination: "/raw/blog/:path*" },
    ];
  },
};

// Fumadocs MDX loader (docs + blog): injects the MDX/`.source` loader
// (Turbopack + webpack rules).
const withMDX = createMDX();

export default withMDX(nextConfig);
