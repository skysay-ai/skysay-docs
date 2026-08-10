import { defineCollections, defineConfig, defineDocs, frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

// Docs and blog share ONE MDX pipeline. `docs` powers the Fumadocs /docs tree
// (with meta.json per group for sidebar order); `blog` is a flat doc collection
// rendered by the same MDX toolchain and theme.
//
// `postprocess.includeProcessedMarkdown` makes every compiled page expose its
// raw markdown via `data.getText('processed')` — that backs the per-page `.md`
// URLs and the combined /llms-full.txt corpus (agent-readable, "works with
// any AI"). It is a per-collection option, so both collections opt in.
export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    postprocess: { includeProcessedMarkdown: true },
  },
});

export const blog = defineCollections({
  type: "doc",
  dir: "content/blog",
  schema: frontmatterSchema.extend({
    date: z.string().date().or(z.date()).optional(),
    author: z.string().optional(),
    tag: z.string().optional(),
  }),
  postprocess: { includeProcessedMarkdown: true },
});

export default defineConfig();
