import { loadBlogIndex } from "@/lib/llms-blog";
import { PAGES_FILE, loadPagesIndex } from "@/lib/llms-pages";
import { blogSource, source } from "@/lib/source";

// Site-root llms.txt (the llms.txt-spec index): titled links to every doc and
// blog page, plus the API surface. This is the DOCS/BLOG corpus index; the API
// serves its own /control-plane/llms.txt — different paths, cross-linked.
//
// The Blog section comes from the blog app's /blog/llms.txt, falling back to
// the bundled legacy snapshot (see src/lib/llms-blog.js), and the Product
// section from the web app's /llms-pages.txt, falling back to the two bundled
// lines (see src/lib/llms-pages.js), so this route is regenerated every 5
// minutes instead of being frozen at build time.
export const revalidate = 300;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://skysay.ai";

function line(page) {
  const desc = page.data.description ? `: ${page.data.description}` : "";
  return `- [${page.data.title}](${SITE}${page.url})${desc}`;
}

export async function GET() {
  const docs = source.getPages().map(line).join("\n");
  const blog = await loadBlogIndex(() =>
    blogSource
      .getPages()
      .sort((a, b) => (b.data.date ? new Date(b.data.date).getTime() : 0) - (a.data.date ? new Date(a.data.date).getTime() : 0))
      .map(line)
      .join("\n"),
  );

  const pages = await loadPagesIndex(
    [
      `- [Phone numbers for AI agents](${SITE}/phone-numbers-for-ai-agents): numbers in 100+ countries for personal calls, businesses, and apps; connect through MCP, the API, or the workspace. Availability, supported features, and registration requirements vary by number.`,
      `- [Pricing](${SITE}/pricing): public plans and usage pricing for numbers, voice, hosted AI, and SMS.`,
    ].join("\n"),
  );
  const otherLanguages = pages.live
    ? `\n- [The same pages in every published language](${SITE}/${PAGES_FILE}): the markdown version of each page, grouped by language.`
    : "";

  const body = `# Skysay

> Agent-native telephony: phone numbers and supported calling/SMS capabilities for AI agents through MCP and an API. Client setup and scope permissions are required.

## For businesses

Get phone numbers and create AI agents that make and answer calls for you. Build an AI receptionist, support agent or follow-up assistant. Choose its voice, language and instructions, then manage calls, send SMS and run contact campaigns. Agents configured in Skysay can use connected calendars and business tools during calls. Review recordings, transcripts, summaries and campaign results. Use Skysay-hosted agents or connect your own. Phone-number coverage in 100+ countries.

- [Solutions by task and industry](${SITE}/solutions): what the AI agent does on the call for each task (reception, after-hours answering, appointment requests, reminders) and each industry, with an example call and its limits.

## Product
${pages.marker}

${pages.lines}${otherLanguages}

## Docs

${docs}

## Blog
${blog.marker}

${blog.lines}

## API surface

- [OpenAPI spec](https://api.skysay.ai/openapi.json): machine-readable API document.
- [API llms.txt](https://api.skysay.ai/llms.txt): the API's own agent index.
- [MCP endpoint](https://api.skysay.ai/mcp): POST /mcp — hosted Model Context Protocol.

## Full corpus

- [llms-full.txt](${SITE}/llms-full.txt): every doc and blog page in one file.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
