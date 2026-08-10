import { DocsBody } from "fumadocs-ui/page";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getMDXComponents } from "@/mdx-components";
import { blogSource } from "@/lib/source";

function formatDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogPostPage(props) {
  const params = await props.params;
  const page = blogSource.getPage([params.slug]);
  if (!page) {
    notFound();
  }

  const MDXContent = page.data.body;
  const date = formatDate(page.data.date);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-16 lg:px-8">
      <Link href="/blog" className="font-mono text-xs text-fd-muted-foreground hover:text-fd-foreground">
        ← Blog
      </Link>
      <header className="mb-8 mt-4 border-b border-fd-border pb-8">
        <div className="mb-3 flex items-center gap-3 font-mono text-xs text-fd-muted-foreground">
          {page.data.tag ? (
            <span className="rounded-full border border-fd-primary/40 px-2 py-0.5 uppercase tracking-wider text-fd-primary">
              {page.data.tag}
            </span>
          ) : null}
          {date ? <time>{date}</time> : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-fd-foreground">{page.data.title}</h1>
        {page.data.description ? (
          <p className="mt-3 text-lg text-fd-muted-foreground">{page.data.description}</p>
        ) : null}
        {page.data.author ? (
          <p className="mt-4 text-sm text-fd-muted-foreground">By {page.data.author}</p>
        ) : null}
      </header>
      <DocsBody>
        <MDXContent components={getMDXComponents()} />
      </DocsBody>
    </main>
  );
}

export function generateStaticParams() {
  return blogSource.getPages().map((page) => ({ slug: page.slugs[0] }));
}

export async function generateMetadata(props) {
  const params = await props.params;
  const page = blogSource.getPage([params.slug]);
  if (!page) {
    notFound();
  }
  return {
    title: page.data.title,
    description: page.data.description,
  };
}
