import { blogSource, getLLMText, source } from "@/lib/source";

// Site-root /llms-full.txt: the WHOLE docs + blog corpus in one pull, with a
// header block that cross-links the API surface so an agent gets docs + API in
// one request.
export const dynamic = "force-static";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://openphonex.com";

export async function GET() {
  const docsPages = source.getPages();
  const blogPages = [...blogSource.getPages()].sort(
    (a, b) => (b.data.date ? new Date(b.data.date).getTime() : 0) - (a.data.date ? new Date(a.data.date).getTime() : 0),
  );

  const header = `# OpenPhonex — full docs + blog corpus

Agent-native telephony: real phone numbers, calls, and SMS an AI agent runs on
its own over MCP. This file is the entire OpenPhonex documentation and blog in
one pull. The machine-readable API lives at:

- OpenAPI: ${SITE}/control-plane/openapi.json
- API llms-full.txt: ${SITE}/control-plane/llms-full.txt
- MCP endpoint: POST ${SITE}/control-plane/mcp

Each page below is also available as raw markdown at <page-url>.md.

---`;

  const docsBody = (await Promise.all(docsPages.map((page) => getLLMText(page)))).join("\n\n---\n\n");
  const blogBody = (await Promise.all(blogPages.map((page) => getLLMText(page)))).join("\n\n---\n\n");

  const body = `${header}

# Documentation

${docsBody}

---

# Blog

${blogBody}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
