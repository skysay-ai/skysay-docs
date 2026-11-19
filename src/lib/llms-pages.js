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
// at least one page line and only well-formed ones (see isPageLine). Anything
// else falls through, and /llms.txt then
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

// One page line as the web app writes it: a title without brackets, the
// markdown URL of a page on this site, and a plain-text description, with no
// control character anywhere. The fetched text is printed in /llms.txt under Skysay's
// name, so a line that links anywhere else, or carries anything that could
// start a new line or section, is not a page line.
const PAGE_LINE = /^- \[[^\[\]]+\]\(https:\/\/skysay\.ai\/[a-z0-9]+(?:[/-][a-z0-9]+)*\.md\): \S.*$/;
const CONTROL_CHARACTER = /[\x00-\x1f\x7f\x85\u2028\u2029]/;

// The description is plain text: anything that could be a second link (a
// markdown link, an autolink, a bare URL or HTML) is not.
const DESCRIPTION_MARKUP = /\]\(|:\/\/|[<>]|www\./i;

export function isPageLine(line) {
  if (CONTROL_CHARACTER.test(line) || !PAGE_LINE.test(line)) {
    return false;
  }
  const description = line.slice(line.indexOf("): ") + 3);
  return !DESCRIPTION_MARKUP.test(description);
}

// The page lines of the English section: the `- [` lines between the English
// heading and the next heading. "" when the file has no such section, or when
// any of those lines is not a page line: a file that is wrong in one place is
// not trusted in the others.
export function parseEnglishPages(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === ENGLISH_HEADING);
  if (start < 0) {
    return "";
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const entries = (end < 0 ? rest : rest.slice(0, end)).filter((line) => line.startsWith("- ["));
  return entries.every(isPageLine) ? entries.join("\n") : "";
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
