import { createFromSource } from "fumadocs-core/search/server";

import { source } from "@/lib/source";

// Orama static search over the docs corpus, built at request time from the
// Fumadocs source. Client-built index, no network egress.
export const { GET } = createFromSource(source);
