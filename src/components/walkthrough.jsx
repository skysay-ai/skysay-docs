import { getWalkthrough } from "@/walkthroughs/index.js";

import { WalkthroughView } from "./walkthrough-view.jsx";

// <Walkthrough id="import-a-number" /> in MDX, optionally tab="didww" to open
// on another tab than the walkthrough's default. Looks the data up on the
// server (an unknown id or tab throws, failing the build) and hands the client
// view only the one walkthrough the page shows. The same id gives the page's
// plain-text steps in its markdown export; see source.config.ts.
export function Walkthrough({ id, tab }) {
  const data = getWalkthrough(id);
  if (tab !== undefined && !data.tabs.some((t) => t.id === tab)) {
    throw new Error(`Walkthrough ${id} has no tab ${JSON.stringify(tab)}`);
  }
  return <WalkthroughView data={tab ? { ...data, defaultTab: tab } : data} />;
}
