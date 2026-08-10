import Link from "next/link";

import { blogSource } from "@/lib/source";

export const metadata = {
  title: "Blog",
  description: "Product news and engineering notes from the OpenPhonex team.",
};

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

export default function BlogIndexPage() {
  const posts = [...blogSource.getPages()].sort((a, b) => {
    const da = a.data.date ? new Date(a.data.date).getTime() : 0;
    const db = b.data.date ? new Date(b.data.date).getTime() : 0;
    return db - da;
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-16 lg:px-8">
      <header className="mb-10">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.13em] text-fd-muted-foreground">Blog</p>
        <h1 className="text-3xl font-semibold tracking-tight text-fd-foreground">
          Product news &amp; engineering notes
        </h1>
        <p className="mt-3 max-w-xl text-fd-muted-foreground">
          How OpenPhonex ships agent-native telephony — launches, deployment modes, and the MCP + llms.txt story.
        </p>
      </header>

      <ul className="flex flex-col gap-4">
        {posts.map((post) => {
          const date = formatDate(post.data.date);
          return (
            <li key={post.url}>
              <Link
                href={post.url}
                className="block rounded-2xl border border-fd-border bg-fd-card p-6 transition-colors hover:border-fd-primary/50"
              >
                <div className="mb-2 flex items-center gap-3 font-mono text-xs text-fd-muted-foreground">
                  {post.data.tag ? (
                    <span className="rounded-full border border-fd-primary/40 px-2 py-0.5 uppercase tracking-wider text-fd-primary">
                      {post.data.tag}
                    </span>
                  ) : null}
                  {date ? <time>{date}</time> : null}
                </div>
                <h2 className="text-lg font-semibold text-fd-foreground">{post.data.title}</h2>
                {post.data.description ? (
                  <p className="mt-2 text-sm text-fd-muted-foreground">{post.data.description}</p>
                ) : null}
                {post.data.author ? (
                  <p className="mt-4 text-xs text-fd-muted-foreground">By {post.data.author}</p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
