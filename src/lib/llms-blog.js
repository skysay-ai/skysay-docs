// The Blog part of the site-root /llms.txt and /llms-full.txt.
//
// The blog is served by its own app (skysay-blog) on skysay.ai/blog. That
// app publishes /blog/llms.txt and /blog/llms-full.txt, and the root llms
// files here pull the Blog section and the blog corpus from it, in order:
//
//   1. ${BLOG_INTERNAL_URL}/blog/<file>, when BLOG_INTERNAL_URL is set (it is
//      bound to the blog component's private URL on App Platform);
//   2. https://skysay.ai/blog/<file>, the public URL. Until /blog is routed
//      to the blog app, this app answers that URL itself with a 404, so it
//      falls through;
//   3. the bundled legacy snapshot: this app's own frozen copy of the blog
//      (content/blog), rendered exactly as before the blog moved.
//
// A fetched file counts only if it answers 200 with a text/plain body whose
// second line is exactly BLOG_SOURCE_LINE, within FETCH_TIMEOUT_MS. Anything
// else, including a thrown error, falls through to the next source, so the
// root llms files always render.
//
// This module has no framework or content imports so that
// scripts/llms-blog.test.mjs can run it under plain `node`.

export const PUBLIC_BLOG_ORIGIN = "https://skysay.ai";
export const BLOG_SOURCE_LINE = "> source: skysay-blog";
export const LIVE_MARKER = "> blog source: skysay-blog (live)";
export const SNAPSHOT_MARKER = "> blog source: bundled legacy snapshot";
export const FETCH_TIMEOUT_MS = 3000;

export function blogFileUrls(file, env = process.env) {
  const urls = [];
  const internal = (env.BLOG_INTERNAL_URL || "").trim().replace(/\/+$/, "");
  if (internal) {
    urls.push(`${internal}/blog/${file}`);
  }
  urls.push(`${PUBLIC_BLOG_ORIGIN}/blog/${file}`);
  return urls;
}

async function fetchContractText(url, fetchImpl, timeoutMs) {
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "text/plain" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) {
      return null;
    }
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!/^text\/plain\s*(;|$)/.test(contentType)) {
      return null;
    }
    const text = await response.text();
    if (text.split("\n")[1] !== BLOG_SOURCE_LINE) {
      return null;
    }
    return text;
  } catch {
    return null;
  }
}

// The first source that answers with a valid contract file, or null.
export async function fetchBlogFile(file, { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  for (const url of blogFileUrls(file, env)) {
    const text = await fetchContractText(url, fetchImpl, timeoutMs);
    if (text !== null) {
      return text;
    }
  }
  return null;
}

// /blog/llms.txt: the Blog section is exactly the lines that start with "- [".
export function parseBlogIndex(text) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("- ["))
    .map((line) => line.trimEnd())
    .join("\n");
}

// /blog/llms-full.txt: the corpus is everything after the first blank line
// that follows line 2.
export function parseBlogCorpus(text) {
  const lines = text.split("\n");
  let blank = 2;
  while (blank < lines.length && lines[blank].trim() !== "") {
    blank += 1;
  }
  return lines
    .slice(blank + 1)
    .join("\n")
    .trimEnd();
}

// { marker, lines } for the /llms.txt Blog section. `legacyLines` is called
// only when no blog app answered.
export async function loadBlogIndex(legacyLines, options) {
  const text = await fetchBlogFile("llms.txt", options);
  if (text !== null) {
    return { marker: LIVE_MARKER, lines: parseBlogIndex(text) };
  }
  return { marker: SNAPSHOT_MARKER, lines: await legacyLines() };
}

// { marker, body } for the /llms-full.txt blog corpus. `legacyBody` is called
// only when no blog app answered.
export async function loadBlogCorpus(legacyBody, options) {
  const text = await fetchBlogFile("llms-full.txt", options);
  if (text !== null) {
    return { marker: LIVE_MARKER, body: parseBlogCorpus(text) };
  }
  return { marker: SNAPSHOT_MARKER, body: await legacyBody() };
}
