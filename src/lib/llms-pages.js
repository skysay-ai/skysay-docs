// The Product part of the site-root /llms.txt: the marketing pages.
//
// The marketing pages are served by the web app, which keeps the one list of
// them and publishes it at /llms-pages.txt: one `- [title](markdown URL):
// description` line per page, in a section per language. This app copies the
// English section into /llms.txt, so a page added to the web app's list
// appears here without an edit, and links the full file for the other
// languages.
//
// The file is read in order from:
//
//   1. ${WEB_INTERNAL_URL}/llms-pages.txt, when WEB_INTERNAL_URL is set;
//   2. https://skysay.ai/llms-pages.txt, the public URL.
//
// It counts only if it answers 200 with a text/plain body whose second line is
// exactly PAGES_SOURCE_LINE, within the timeout, and its English section has
// at least one page line. Anything else falls through, and /llms.txt then
// prints the two bundled lines it has always had, so it always renders.
//
// No framework or content imports, so scripts/llms-pages.test.mjs can run it
// under plain `node`.
import { FETCH_TIMEOUT_MS, PUBLIC_BLOG_ORIGIN, fetchContractText } from "./llms-blog.js";

export const PUBLIC_SITE_ORIGIN = PUBLIC_BLOG_ORIGIN;
export const PAGES_FILE = "llms-pages.txt";
export const PAGES_SOURCE_LINE = "> source: skysay-web";
export const PAGES_LIVE_MARKER = "> pages source: skysay-web (live)";
export const PAGES_BUNDLED_MARKER = "> pages source: bundled list";
const ENGLISH_HEADING = "## English";

export function pagesFileUrls(env = process.env) {
  const urls = [];
  const internal = (env.WEB_INTERNAL_URL || "").trim().replace(/\/+$/, "");
  if (internal) {
    urls.push(`${internal}/${PAGES_FILE}`);
  }
  urls.push(`${PUBLIC_SITE_ORIGIN}/${PAGES_FILE}`);
  return urls;
}

// The page lines of the English section: the `- [` lines between the English
// heading and the next heading. "" when the file has no such section.
export function parseEnglishPages(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trimEnd() === ENGLISH_HEADING);
  if (start < 0) {
    return "";
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end < 0 ? rest : rest.slice(0, end))
    .filter((line) => line.startsWith("- ["))
    .map((line) => line.trimEnd())
    .join("\n");
}

// { marker, lines } for the /llms.txt Product section. `bundledLines` is the
// fallback text, used when no source answered with a usable file.
export async function loadPagesIndex(bundledLines, { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  for (const url of pagesFileUrls(env)) {
    const text = await fetchContractText(url, fetchImpl, timeoutMs, PAGES_SOURCE_LINE);
    const lines = text === null ? "" : parseEnglishPages(text);
    if (lines) {
      return { marker: PAGES_LIVE_MARKER, lines, live: true };
    }
  }
  return { marker: PAGES_BUNDLED_MARKER, lines: bundledLines, live: false };
}
