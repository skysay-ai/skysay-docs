import { blogSource, source } from "@/lib/source";

// Site-root llms.txt (the llms.txt-spec index): titled links to every doc and
// blog page, plus the API surface. This is the DOCS/BLOG corpus index; the API
// serves its own /control-plane/llms.txt — different paths, cross-linked.
export const dynamic = "force-static";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://skysay.ai";

function line(page) {
  const desc = page.data.description ? `: ${page.data.description}` : "";
  return `- [${page.data.title}](${SITE}${page.url})${desc}`;
}

export function GET() {
  const docs = source.getPages().map(line).join("\n");
  const blog = blogSource
    .getPages()
    .sort((a, b) => (b.data.date ? new Date(b.data.date).getTime() : 0) - (a.data.date ? new Date(a.data.date).getTime() : 0))
    .map(line)
    .join("\n");

  const body = `# Skysay

> Agent-native telephony: real phone numbers, calls, and SMS an AI agent runs on its own over MCP, described in llms.txt so any AI already knows how to use it.

## Product

- [Pricing](${SITE}/pricing): public plans and usage pricing for numbers, voice, hosted AI, and SMS.

## Docs

${docs}

## Blog

${blog}

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
