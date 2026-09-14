import { blogSource, source } from "@/lib/source";

// Sitemap for everything this app owns: every /docs page, the /blog index, and
// every /blog post. It is published at /docs/sitemap.xml rather than
// /sitemap.xml because only the docs prefixes are routed to this component on
// skysay.ai — the site-root sitemap stays with the main app and links here
// as a sitemap index entry.
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://skysay.ai").replace(/\/$/, "");

function absoluteUrl(pathname) {
  return `${SITE}${pathname === "/" ? "" : pathname}`;
}

function blogLastModified(value) {
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default function sitemap() {
  const docsPages = source.getPages().map((page) => ({
    url: absoluteUrl(page.url),
    changeFrequency: "weekly",
    priority: page.url === "/docs" ? 0.8 : 0.7,
  }));

  const blogIndex = [
    {
      url: absoluteUrl("/blog"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  const blogPages = blogSource.getPages().map((page) => ({
    url: absoluteUrl(page.url),
    lastModified: blogLastModified(page.data.date),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...docsPages, ...blogIndex, ...blogPages];
}
