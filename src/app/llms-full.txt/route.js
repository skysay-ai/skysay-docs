import { loadBlogCorpus } from "@/lib/llms-blog";
import { blogSource, getLLMText, source } from "@/lib/source";

// Site-root /llms-full.txt: the WHOLE docs + blog corpus in one pull, with a
// header block that cross-links the API surface so an agent gets docs + API in
// one request.
//
// The blog corpus comes from the blog app's /blog/llms-full.txt, falling back
// to the bundled legacy snapshot (see src/lib/llms-blog.js), so this route is
// regenerated every 5 minutes instead of being frozen at build time.
export const revalidate = 300;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://skysay.ai";

export async function GET() {
  const docsPages = source.getPages();
  const blogPages = () =>
    [...blogSource.getPages()].sort(
      (a, b) => (b.data.date ? new Date(b.data.date).getTime() : 0) - (a.data.date ? new Date(a.data.date).getTime() : 0),
    );

  const header = `# Skysay — full docs + blog corpus

Agent-native telephony: real phone numbers, calls, and SMS an AI agent runs on
its own over MCP. This file is the entire Skysay documentation and blog in
one pull.

## Product

- [Phone numbers for AI agents](${SITE}/phone-numbers-for-ai-agents): numbers in 100+ countries for personal calls, businesses, and apps; connect through MCP, the API, or the workspace. Availability, supported features, and registration requirements vary by number.

## API surface

The machine-readable API lives at:

- OpenAPI: ${SITE}/control-plane/openapi.json
- API llms-full.txt: ${SITE}/control-plane/llms-full.txt
- MCP endpoint: POST ${SITE}/control-plane/mcp

Each page below is also available as raw markdown at <page-url>.md.

---`;

  const docsBody = (await Promise.all(docsPages.map((page) => getLLMText(page)))).join("\n\n---\n\n");
  const blog = await loadBlogCorpus(async () =>
    (await Promise.all(blogPages().map((page) => getLLMText(page)))).join("\n\n---\n\n"),
  );

  const body = `${header}

# Documentation

${docsBody}

---

# Blog
${blog.marker}

${blog.body}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
