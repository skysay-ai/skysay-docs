# OpenPhonex documentation

The public documentation and blog for [OpenPhonex](https://openphonex.com) —
agent-native telephony: real phone numbers, calls, and SMS an AI agent runs on
its own over MCP.

This repository **is** the site. Its released image serves these paths on
`openphonex.com`:

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

Merging to `main` does not publish the site. The `openphonex-docs` image
component shares the production web application with the private dashboard.
Release it after the application release is verified and public release-log
reconciliation has been attempted. If reconciliation refuses its checkpoint,
record that retryable documentation failure; do not invent a checkpoint or
block publishing otherwise verified documentation.

The operator needs a clean, current `main` checkout of this repository and the
private OpenPhonex application repository, Docker's `desktop-linux` context,
Node 22, Python 3.11+, and authenticated `doctl` and registry access. The private
checkout supplies the existing promotion lease and registry guards; the docs
release uses that same lease so it cannot race an application promotion.

```bash
python3 scripts/release_docs.py prepare --app-repo /path/to/OpenPhonex
python3 scripts/release_docs.py promote --app-repo /path/to/OpenPhonex \
  --receipt /private/path/printed-by-prepare.json --execute
```

Preparation checks committed source, builds once for Linux AMD64, pushes a
unique full-commit image tag, and probes the image by digest. It writes a
private content-addressed receipt binding the source, checks, digest, existing
docs image, active deployment and complete app-spec fingerprint. It cannot
include ignored local files in the build context. Receipts and logs do not
contain the app spec or credentials.

Promotion never builds or retags. It verifies the receipt and current live
fences, changes only the docs image tag, checks the deployed revision header
and public routes, and records timing. A repeat after successful promotion
verifies the existing deployment. Failed promotion restores the previous docs
tag only while the spec still belongs to that operation; concurrent spec
changes refuse rollback. A rollback failure exits with code 2 for operator
attention. The previous healthy application remains the rollback target.

Coordinate with other release operators. A changed main commit, app spec or
deployment invalidates preparation; do not edit receipts or manually overwrite
an image tag to bypass a refusal.

If a push succeeds but preparation is interrupted or its image proof fails,
the tag remains unpromoted. A repeated preparation refuses that existing tag;
automatic recovery of an incomplete preparation is intentionally unsupported.
Keep its immutable digest for investigation and never overwrite the tag.

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

## Contributing

Pull requests are welcome — typo fixes, clarifications, missing steps, and new
pages all help.

1. Fork, branch, edit the `.mdx` file.
2. Run `npm run build` and `npm run scan-secrets` locally.
3. Open a PR. CI runs a secret scan and a production build on every PR; both
   must pass.
4. On merge to `main`, the change is ready for the receipt-based release above.
   Confirm the public revision and content before describing it as live.

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
