import { loadBlogIndex } from "@/lib/llms-blog";
import { blogSource, source } from "@/lib/source";

// Site-root llms.txt (the llms.txt-spec index): titled links to every doc and
// blog page, plus the API surface. This is the DOCS/BLOG corpus index; the API
// serves its own /control-plane/llms.txt — different paths, cross-linked.
//
// The Blog section comes from the blog app's /blog/llms.txt, falling back to
// the bundled legacy snapshot (see src/lib/llms-blog.js), so this route is
// regenerated every 5 minutes instead of being frozen at build time.
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

  const body = `# Skysay

> Agent-native telephony: real phone numbers, calls, and SMS an AI agent runs on its own over MCP, described in llms.txt so any AI already knows how to use it.

## Product

- [Phone numbers for AI agents](${SITE}/phone-numbers-for-ai-agents): numbers in 100+ countries for personal calls, businesses, and apps; connect through MCP, the API, or the workspace. Availability, supported features, and registration requirements vary by number.
- [Pricing](${SITE}/pricing): public plans and usage pricing for numbers, voice, hosted AI, and SMS.

## Docs

${docs}

## Blog
${blog.marker}

${blog.lines}

## API surface

- [OpenAPI spec](${SITE}/control-plane/openapi.json): machine-readable API document.
- [API llms.txt](${SITE}/control-plane/llms.txt): the API's own agent index.
- [MCP endpoint](${SITE}/control-plane/mcp): POST /mcp — hosted Model Context Protocol.

## Full corpus

- [llms-full.txt](${SITE}/llms-full.txt): every doc and blog page in one file.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
