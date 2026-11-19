// Registry of the docs walkthroughs. A page embeds one with
// <Walkthrough id="…" /> (registered in src/mdx-components.jsx); the same id
// feeds the page's plain-text markdown through source.config.ts.
//
// Each walkthrough is plain data (no React), so the MDX config, the server
// component and the tests all import the same object. Shape:
//
//   { id, title, crumb?, note?, defaultTab?, tabs: [Tab] }
//   Tab    = { id, label, title?, lede?, steps: [Step] }
//          | { id, label, title?, lede?, methods: [{ id, label, steps: [Step] }] }
//   Step   = { label, title, intro?, main: [Block], side?: Side }
//   Side   = { label, title?, tip?: { title?, text }, blocks?: [Block] }
//   Block  = see BLOCK_TYPES in src/walkthroughs/validate.js
//
// Strings may use **bold**, `code` and [text](/docs/…) links. Everything else
// is literal text.
//
// Unknown ids fail closed: getWalkthrough throws, so a typo fails the build
// rather than rendering an empty box or dropping the steps from llms.txt.

import importANumber from "./import-a-number.js";
import installConnector from "./install-connector.js";
import launchACampaign from "./launch-a-campaign.js";
import simulationsLab from "./simulations-lab.js";
import { walkthroughMarkdown } from "./markdown.js";
import { validateWalkthrough } from "./validate.js";

export const walkthroughs = Object.freeze(
  Object.fromEntries(
    [importANumber, installConnector, launchACampaign, simulationsLab].map((w) => [w.id, validateWalkthrough(w)]),
  ),
);

export function getWalkthrough(id) {
  const walkthrough = Object.hasOwn(walkthroughs, id) ? walkthroughs[id] : undefined;
  if (!walkthrough) {
    throw new Error(`Unknown walkthrough id ${JSON.stringify(id)}. Known: ${Object.keys(walkthroughs).join(", ")}`);
  }
  return walkthrough;
}

// The `stringify` hook source.config.ts gives the processed-markdown export:
// a <Walkthrough id="…" /> becomes that walkthrough's plain-text steps. Any
// other node returns undefined, which keeps the default output.
export function walkthroughNodeText(node) {
  if (node.type !== "mdxJsxFlowElement" || node.name !== "Walkthrough") return undefined;
  const id = node.attributes.find((attr) => attr.type === "mdxJsxAttribute" && attr.name === "id")?.value;
  if (typeof id !== "string") {
    throw new Error('<Walkthrough> needs a literal id attribute, for example id="import-a-number"');
  }
  return walkthroughMarkdown(getWalkthrough(id));
}
