import { Book } from "iconoir-react";

// Shared chrome for the Fumadocs /docs and /blog layouts: brand + "Docs" tag on
// the left, Home / Blog / Pricing / API / llms.txt links, and a Start CTA.
// Docs content is English-only, so this chrome is intentionally not localized.
//
// The non-docs links (/, /pricing, /start, /control-plane/*) are served by the
// main skysay.ai app, not by this one. They are same-origin absolute paths
// on purpose: on the live domain a path-based ingress rule sends them to the
// right component.
export const baseNavOptions = {
  title: (
    <span className="inline-flex items-center gap-2 font-semibold">
      <Book className="size-5 text-fd-primary" strokeWidth={1.5} aria-hidden />
      Skysay
      <span className="rounded-md border border-fd-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
        Docs
      </span>
    </span>
  ),
  url: "/docs",
};

export const baseLinks = [
  { text: "Home", url: "/", active: "none" },
  { text: "Blog", url: "/blog" },
  { text: "Pricing", url: "/pricing" },
  { text: "API", url: "/control-plane/openapi.json", external: true },
  { text: "llms.txt", url: "/llms.txt", external: true },
  {
    text: "Start",
    url: "/start",
    type: "button",
    active: "none",
  },
];
