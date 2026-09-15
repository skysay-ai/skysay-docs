import {
  AppWindow,
  BadgeCheck,
  Book,
  BookStack,
  ChatBubble,
  ChatBubbleTranslate,
  ChatLines,
  ClockRotateRight,
  CloudSync,
  CodeBrackets,
  CodeBracketsSquare,
  Compass,
  Cpu,
  CreditCard,
  Cube,
  DatabaseSearch,
  DataTransferBoth,
  DocMagnifyingGlass,
  Download,
  FastArrowRight,
  Forward,
  GitFork,
  GraduationCap,
  Headset,
  Key,
  Language,
  LightBulb,
  Link,
  List,
  Lock,
  Megaphone,
  MicrophoneSpeaking,
  Network,
  OpenBook,
  PlaySolid,
  Puzzle,
  Rocket,
  RssFeed,
  Server,
  SecurityPass,
  ShieldCheck,
  SineWave,
  SoundHigh,
  Terminal,
  TestTube,
  Timer,
  Translate,
  Voice,
  Wrench,
} from "iconoir-react";

// The docs sidebar (section separators + every page in content/docs/) is
// icon-led, Vapi-style. Fumadocs' `loader({ icon })` option calls this
// resolver once per file/folder/separator node in the page tree, passing the
// raw `icon` string from meta.json (`"---[Name]Title---"`) or MDX frontmatter
// (`icon: Name`) — see node_modules/fumadocs-core/dist/icon-*.js. `undefined`
// means the node carries no icon string at all.
//
// This map only imports the ~44 icons actually used, so bundlers tree-shake
// the other ~1600 iconoir-react exports instead of shipping the whole set.
const ICONS = {
  // fumadocs-core's loader builds an invisible top-level "folder" node
  // wrapping the whole content/docs/ tree (the `isGlobalRoot` folder in
  // loader-CoSFINvo.js's `buildFolder`). That node is never rendered — the
  // final `{ type: "root", ... }` object the UI walks doesn't even copy its
  // `icon` over — but it still runs through the SAME `icon` plugin as every
  // real file/folder/separator, so it needs a resolvable name or the
  // fail-closed `undefined` branch below throws on a build that has nothing
  // actually wrong. `content/docs/meta.json`'s top-level `"icon": "Book"`
  // supplies it (matches the nav title icon in docs-layout.config.jsx).
  Book,

  // --- section separators (content/docs/meta.json) ---
  Rocket,
  GraduationCap,
  Compass,
  AppWindow,
  Puzzle,
  CodeBrackets,
  LightBulb,
  Cpu,

  // --- Get started ---
  OpenBook,
  FastArrowRight,
  Download,
  Key,
  CreditCard,
  ClockRotateRight,

  // --- Tutorials ---
  PlaySolid,

  // --- Guides ---
  Link,
  Timer,
  ChatLines,
  Translate,
  SineWave,
  MicrophoneSpeaking,
  Voice,
  GitFork,
  TestTube,
  Headset,
  DocMagnifyingGlass,
  DatabaseSearch,
  ChatBubble,
  Forward,
  ShieldCheck,
  SecurityPass,

  // --- Customer applications ---
  DataTransferBoth,
  Cube,
  Megaphone,
  ChatBubbleTranslate,
  BadgeCheck,

  // --- MCP tools ---
  Server,
  Wrench,
  Lock,

  // --- API reference ---
  Network,
  CodeBracketsSquare,
  Terminal,
  RssFeed,

  // --- Concepts ---
  CloudSync,
  Language,

  // --- Agent surface ---
  SoundHigh,
  List,
  BookStack,
};

/**
 * Fail-closed icon resolver for the docs sidebar page tree.
 *
 * - `undefined` (a page or separator with no `icon` string at all — a missing
 *   frontmatter field, or a zod schema that silently stripped it) THROWS
 *   instead of rendering an iconless row. That failure must surface at build
 *   time, not as a quiet gap in the sidebar noticed only by eye.
 * - An icon name with no entry in `ICONS` THROWS naming it, so a typo in
 *   frontmatter or meta.json fails the build instead of shipping unseen.
 * - A known name renders the icon at the sidebar's standard size. Fumadocs'
 *   own sidebar CSS already constrains descendant `svg` to `size-4` /
 *   `shrink-0` (see fumadocs-ui/dist/layouts/docs/slots/sidebar.js) and the
 *   icon inherits `currentColor`, so it automatically goes muted on an
 *   inactive row and primary-colored on the active one with no extra CSS.
 *   The className/strokeWidth are set explicitly anyway so the icon renders
 *   correctly if ever used outside that sidebar chrome.
 */
export function resolveDocsIcon(name) {
  if (name === undefined) {
    throw new Error("docs sidebar: node without an icon");
  }
  const Icon = ICONS[name];
  if (!Icon) {
    throw new Error(`docs sidebar: unknown icon "${name}"`);
  }
  return <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />;
}

// Exposed for scripts/sidebar-icons.test.mjs: every map entry must be a real
// iconoir-react export, and every icon name used in content/ must resolve
// here.
export const docsIconNames = Object.keys(ICONS);
