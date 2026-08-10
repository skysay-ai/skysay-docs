# OpenPhonex documentation

The public documentation and blog for [OpenPhonex](https://openphonex.com) —
agent-native telephony: real phone numbers, calls, and SMS an AI agent runs on
its own over MCP.

This repository **is** the site. A push to `main` deploys automatically to
`openphonex.com`, which serves these paths from this app:

| Path | What it is |
| --- | --- |
| `/docs`, `/docs/**` | the documentation tree |
| `/blog`, `/blog/**` | product news and engineering notes |
| `/docs/<page>.md`, `/blog/<post>.md` | the same page as raw markdown, for agents |
| `/llms.txt` | the [llms.txt](https://llmstxt.org) index of every page |
| `/llms-full.txt` | the entire docs + blog corpus in one file |
| `/api/search` | full-text search over the docs |
| `/docs/sitemap.xml` | sitemap for every URL this app owns |

Everything else on `openphonex.com` — the marketing site, the dashboard, the
API — is a separate application. Only the paths above come from here.

## Editing content

All prose lives in `content/`:

```
content/
  docs/            19 pages, one .mdx file each
    meta.json      sidebar order and section headings
  blog/            one .mdx file per post
```

A page is a plain MDX file with YAML frontmatter:

```mdx
---
title: Quickstart
description: The five-minute path from install to a placed call.
---

## Install the connector

Body text. Standard markdown, plus the components below.
```

Blog posts additionally support `date`, `author`, and `tag`.

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
```

`scripts/parity-check.mjs` is the migration acceptance gate. Against a running
server it enumerates every `/docs` and `/blog` URL from the content tree, the
app's own sitemap, and (unless `--no-live`) the live site's sitemap, then
compares status, `<title>` and first `<h1>` for each, plus the `/docs/agents`
redirect, the `.md` rewrites, both llms corpora, search, and the `www` → apex
canonical redirect:

```bash
npm start &
node scripts/parity-check.mjs --local http://127.0.0.1:3000 --live https://openphonex.com
```

## Deployment

A standard Next.js app with no custom server and **no `basePath`** — the
hosting layer passes the full path through, so `/docs/...` is `/docs/...` all
the way down.

| | |
| --- | --- |
| Build command | `npm run build` (runs `fumadocs-mdx` first via `prebuild`) |
| Run command | `npm start` (binds `0.0.0.0` on `$PORT`, default 3000) |
| Output | `.next/` — served by `next start`, not a static export |
| Node | 22 or newer (`engines.node` is `>=22.0.0 <27`) |
| Env | `NEXT_PUBLIC_SITE_URL` — absolute-URL base for `llms.txt`, `llms-full.txt` and the sitemap. Needed at **build** time. Defaults to `https://openphonex.com`. |

Some pages are prerendered at build time and `/api/search` is rendered on
demand, so the app needs a Node runtime — a static-site host will not work.

## Contributing

Pull requests are welcome — typo fixes, clarifications, missing steps, and new
pages all help.

1. Fork, branch, edit the `.mdx` file.
2. Run `npm run build` and `npm run scan-secrets` locally.
3. Open a PR. CI runs a secret scan and a production build on every PR; both
   must pass.
4. On merge to `main`, the change is live on `openphonex.com` within minutes.
   There is no separate publish step.

Please keep prose in the existing voice: second person, present tense, concrete
over abstract, no marketing adjectives. Code samples should be runnable as
written.

**Never commit a real phone number, API key, or IP address.** The secret scan
fails the build on any dialable E.164 number outside the ranges reserved for
documentation. Use `+1 555 0100`-style numbers and `tai_...` placeholders.

## Licence

Code in this repository is MIT licensed — see [LICENSE](LICENSE).

The licence for the documentation prose in `content/` is not yet settled and is
**not** granted by the MIT licence above. Until it is stated here, treat the
prose as all rights reserved; open an issue if you need clarity for a specific
use.
