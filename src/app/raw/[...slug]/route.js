import { notFound } from "next/navigation";

import { blogSource, getLLMText, source } from "@/lib/source";

// Backs the pretty per-page `.md` URLs wired in next.config.mjs:
//   /docs/:path*.md  ->  /raw/docs/:path*
//   /blog/:path*.md  ->  /raw/blog/:path*
// Resolves the slug against the docs OR blog source by its first segment and
// returns clean agent-readable markdown.
export async function GET(_request, { params }) {
  const { slug = [] } = await params;
  const [corpus, ...rest] = slug;

  let page;
  if (corpus === "docs") {
    page = source.getPage(rest);
  } else if (corpus === "blog") {
    page = blogSource.getPage(rest);
  }

  if (!page) {
    notFound();
  }

  return new Response(await getLLMText(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export function generateStaticParams() {
  const docs = source.getPages().map((page) => ({ slug: ["docs", ...page.slugs] }));
  const blog = blogSource.getPages().map((page) => ({ slug: ["blog", ...page.slugs] }));
  return [...docs, ...blog];
}
