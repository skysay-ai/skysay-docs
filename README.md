# Skysay documentation

The public documentation and blog for [Skysay](https://skysay.ai) —
agent-native telephony: real phone numbers, calls, and SMS an AI agent runs on
its own over MCP.

This repository **is** the site. Its released image serves these paths on
`skysay.ai`:

| Path | What it is |
| --- | --- |
| `/docs`, `/docs/**` | the documentation tree |
| `/blog`, `/blog/**` | product news and engineering notes |
| `/docs/<page>.md`, `/blog/<post>.md` | the same page as raw markdown, for agents |
| `/llms.txt` | the [llms.txt](https://llmstxt.org) index of every page |
| `/llms-full.txt` | the entire docs + blog corpus in one file |
| `/api/search` | full-text search over the docs |
| `/docs/sitemap.xml` | sitemap for every URL this app owns |

Everything else on `skysay.ai` — the marketing site, the dashboard, the
API — is a separate application. Only the paths above come from here.

## Editing content

All prose lives in `content/`:

```
content/
  docs/            36 pages, one .mdx file each
    meta.json      sidebar order, section headings, and their icons
  blog/            one .mdx file per post
```

A page is a plain MDX file with YAML frontmatter:

```mdx
---
title: Quickstart
description: The five-minute path from install to a placed call.
icon: FastArrowRight
---

## Install the connector

Body text. Standard markdown, plus the components below.
```

`icon` names one of the [Iconoir](https://iconoir.com) icons mapped in
`src/lib/docs-icons.jsx` — it renders next to the page's entry in the sidebar.
It is required: `next build` fails closed on a docs page with no `icon`, or one
naming an icon the map doesn't have (add it to `src/lib/docs-icons.jsx` first,
picking a name no other page or `meta.json` separator already uses — see the
comment above the map, and run `npm run sidebar-icons:test`). Blog posts don't
use `icon`; they additionally support `date`, `author`, and `tag`.

The components available in MDX are the stock
[Fumadocs](https://fumadocs.dev) set — `Steps` / `Step`, `Tabs` / `Tab`,
`Callout`, `Card` / `Cards` — and they are registered globally, so a page never
imports anything. Add a new page by dropping a `.mdx` file into
`content/docs/` and listing its slug in `content/docs/meta.json`; blog posts are
picked up automatically and sorted by `date`.

Adding a page automatically adds it to the sidebar, the search index,
`/llms.txt`, `/llms-full.txt`, its own `.md` URL, and the sitemap. There is no
second place to register it.

## Running locally

Requires Node 22 or newer.

```bash
npm install          # also generates .source/ via fumadocs-mdx
npm run dev          # http://127.0.0.1:3000/docs
```

For a production build:

```bash
npm run build
npm start            # http://127.0.0.1:3000/docs
```

`npm install` and `npm run build` both run `fumadocs-mdx`, which compiles
`content/` into the generated `.source/` directory. `.source/` is not committed.

## Checks

```bash
npm run scan-secrets                 # secret scan (also runs in CI on every push)
python3 scripts/scan_secrets.py --self-test
npm run parity -- --no-live          # every URL resolves, corpora complete
npm run anchor-check                 # every in-site #anchor resolves
npm run sidebar-icons:test           # every sidebar node has a real, unique icon
```

`scripts/anchor-check.mjs` resolves every in-site `#fragment` link against the
ids the BUILT pages actually carry, so a renamed heading cannot leave a link
pointing at a slug that no longer exists — a failure that is otherwise silent,
because the page still loads and the reader just lands at the top of it. Both
the links and the ids are read from the rendered HTML, so a link a component
emits is checked like any other and no heading-slug rules are re-implemented
here. Run it against the same server `parity` uses:

```bash
npm start &
npm run anchor-check -- --local http://127.0.0.1:3000
npm run anchor-check:test            # its parsing rules, and that the gate can fail
```

`scripts/sidebar-icons.test.mjs` is the fail-closed gate behind the sidebar's
icons (`content/docs/meta.json`'s `"---[Icon]Title---"` separators, every
`content/docs/*.mdx` page's `icon` frontmatter, and the
`src/lib/docs-icons.jsx` resolver `next build` uses). It checks every page and
separator names a real, unique icon and that every name in the resolver's map
is a real `iconoir-react` export — the resolver itself already throws at
build time on a missing or unknown icon, this just proves that gate is intact
without needing a full `next build` to see it fail:

```bash
npm run sidebar-icons:test
```

`scripts/parity-check.mjs` is the migration acceptance gate. Against a running
server it enumerates every `/docs` and `/blog` URL from the content tree, the
app's own sitemap, and (unless `--no-live`) the live site's sitemap, then
compares status, `<title>` and first `<h1>` for each, plus the `/docs/agents`
redirect, the `.md` rewrites, both llms corpora, search, and the `www` → apex
canonical redirect:

```bash
npm start &
node scripts/parity-check.mjs --local http://127.0.0.1:3000 --live https://skysay.ai
```

## Deployment

The site deploys on push. The `skysay-docs` component of the production web
application (DigitalOcean App Platform, app `skysay-web`) is built from this
repository's `main` branch with the `Dockerfile` here, `deploy_on_push`
enabled, so merging to `main` publishes the site once DigitalOcean's build and
health check pass. A failed build leaves the previous deployment live.

Before merging, run what the build and the reviewers rely on:

```bash
npm ci && npm run build
python3 -m unittest discover -s tests
python3 scripts/scan_secrets.py
python3 scripts/generate_openapi_reference.py --check   # against api/openapi.json; refresh it with scripts/refresh_openapi_snapshot.py
```

`scripts/release_docs.py` is the retired image-based release (registry image
`skysay-docs`, receipt-gated promotion). It refuses a source-built docs
service by design and is kept only for the history of the receipts it wrote.
The `X-Skysay-Docs-Revision` header is emitted only when the image was built
with a `DOCS_REVISION` build argument; source builds omit it, and the deployed
commit is read from the DigitalOcean deployment instead.

A standard Next.js app with no custom server and **no `basePath`** — the
hosting layer passes the full path through, so `/docs/...` is `/docs/...` all
the way down.

| | |
| --- | --- |
| Build command | `npm run build` (runs `fumadocs-mdx` first via `prebuild`) |
| Run command | `npm start` (binds `0.0.0.0` on `$PORT`, default 3000) |
| Output | `.next/` — served by `next start`, not a static export |
| Node | 22 or newer (`engines.node` is `>=22.0.0 <27`) |
| Env | `NEXT_PUBLIC_SITE_URL` — absolute-URL base for `llms.txt`, `llms-full.txt` and the sitemap. Needed at **build** time. Defaults to `https://skysay.ai`. |

Some pages are prerendered at build time and `/api/search` is rendered on
demand, so the app needs a Node runtime — a static-site host will not work.

## Release log entry format

`content/docs/changelog.mdx` is written by the release agent after a verified
production promotion (see the application repository's `docs/AUTO_DEPLOY.md`,
step 3). Every entry uses the same shape, decided by the founder on
6 September 2026:

- A `## <date>` heading per release day (UTC, the day the last required lane
  and proof went live), newest first, and a `### <entry title>` heading per
  customer-facing change.
- Under the heading, two to five bullets. Each bullet is one line of plain,
  customer-facing English with one idea, roughly 12 to 30 words. Keep product
  names, bold UI labels, code spans (`PATCH /v1/...`, field names) and numbers
  exact. State limits, defaults, where the control lives, and what still needs
  operator review.
- The last bullet carries the entry's links, joined by ` · `, pointing at the
  guide section a customer uses to configure the feature.
- No prose paragraphs, tables, nested bullets, or bold at the start of every
  bullet. One blank line between the heading and the list and one after it.

Example:

```mdx
### Self-serve outbound campaigns

- Upload a contact list, set calling windows and a retry policy, and launch an agent at your own customers or consented contacts, without an operator.
- The four-step wizard checks column mapping, calling hours and the cost estimate before launch.
- Every campaign call clears the do-not-call register when placed and again when the agent starts talking.
- Cold sales and telemarketing still go through operator review.
- [Read Campaigns](/docs/campaigns) · [Build your do-not-call register](/docs/campaigns#do-not-call-register)
```

Only major customer-facing capabilities and serious customer-visible
corrections get an entry; internal maintenance, CI and release machinery,
refactors and disabled flags do not.

A verified release without an editorial entry still advances `release-state.json`.
Its checkpoint date may therefore be later than the latest changelog heading,
but must never precede a published entry.

## Contributing

Pull requests are welcome — typo fixes, clarifications, missing steps, and new
pages all help.

1. Fork, branch, edit the `.mdx` file.
2. Run `npm run build`, `npm run scan-secrets` and `npm run anchor-check`
   (against a running `npm start`) locally.
3. Open a PR. CI runs a secret scan and a production build on every PR; both
   must pass.
4. On merge to `main`, the change is ready for the receipt-based release above.
   Confirm the public revision and content before describing it as live.

Please keep prose in the existing voice: second person, present tense, concrete
over abstract, no marketing adjectives. Code samples should be runnable as
written.

**Never commit a real phone number, API key, or IP address.** The secret scan
fails the build on any dialable E.164 number outside the ranges reserved for
documentation. Use `+1 555 0100`-style numbers and `sky_...` placeholders.

## Licence

Code in this repository is MIT licensed — see [LICENSE](LICENSE).

The licence for the documentation prose in `content/` is not yet settled and is
**not** granted by the MIT licence above. Until it is stated here, treat the
prose as all rights reserved; open an issue if you need clarity for a specific
use.
