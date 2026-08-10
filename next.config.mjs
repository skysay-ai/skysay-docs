import { fileURLToPath } from "node:url";

import { createMDX } from "fumadocs-mdx/next";

const root = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
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
  async redirects() {
    return [
      // Keep one canonical host for search engines and shared links. On
      // openphonex.com the path-based ingress rules route the docs prefixes to
      // this app on BOTH hostnames, so the www -> apex redirect has to exist
      // here too or www.openphonex.com/docs would answer 200 at a
      // non-canonical host and split indexing.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.openphonex.com" }],
        destination: "https://openphonex.com/:path*",
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
