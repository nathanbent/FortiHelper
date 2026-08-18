# 🛡️ FortiNate (beta)

Browser-based generators for FortiGate / FortiOS CLI config. Paste a list,
tweak options, copy the generated config into your FortiGate. Everything runs
client-side — nothing you paste leaves the page (the only network calls are
optional DNS-over-HTTPS lookups when you ask for resolved IP objects).

## Tools

The app opens on a **Home** launcher that groups the tools by what you are
trying to do — build config, change config, look things up. The nav bar
carries the same split as hairline-separated groups.

- **Object Helper** — turn a list of FQDNs, IPs, CIDRs, and IP ranges into
  `config firewall address` objects and address groups, with naming prefixes,
  comments, colors, interfaces, and more. A bulk comment can be added to every
  object, appended to whatever comment it already has.
- **Webfilter Generator** — turn a domain list into static URL filter entries,
  emitting a complete `config webfilter urlfilter` list by default.
  Types are detected per entry by default (a domain containing `*` is a
  wildcard, anything else is simple) and can be forced to `simple` /
  `wildcard` / `regex`. Supports `block` / `exempt` / `allow` / `monitor`
  actions, per-entry `set exempt` scanning bypasses, list-level
  `set include-subdomains`, and an optional `*` or `*.` wildcard prefix.
  Output as bare entry blocks, numbered `config entries` bodies, or a complete
  `config webfilter urlfilter` list — optionally followed by the
  `config webfilter profile` block that binds it via `set urlfilter-table`.
- **Content Filter** — turn a banned-word list into `config webfilter content`
  entries: `wildcard` / `regexp` pattern types, per-pattern score, language,
  and `block` / `exempt` actions, optionally followed by the
  `config webfilter profile` block that binds it via `set bword-table` and
  `set bword-threshold`. Reports how many matches it takes to block a page.

- **Reference** — curated cheat sheets, collapsed to a scannable index and
  filtered by Topic and Kind dropdowns plus a live search: diagnostic command
  lists (with "Copy all" for sequences), multi-line config templates, and the
  FortiGate color-ID table with swatches. Click **+** on any command to add it
  to a selection tray, or **Add all** to take a whole section, then copy the
  lot as one block — a debug sequence can be assembled across several sheets.
  See
  [Adding reference content](#adding-reference-content).
- **Templates** — fill in a site's details and get the whole build-out config.
  The form is built from the template itself, so your own template works the
  same way. The public build ships only generic examples — see
  [Public and private builds](#public-and-private-builds).

Each tool keeps its everyday settings in view and tucks the rest behind an
**Advanced** section. The header has a Theme control — light, dark, or follow
the operating system (the default).

The first two tools are TypeScript ports of the original Python CLI scripts in
[`input-ideas/`](input-ideas/), kept behavior-compatible via golden-file tests
that compare against the Python scripts' actual output.

## Development

```bash
npm install
npm run dev            # local dev server
npm test               # vitest (includes Python-parity golden tests)
npm run build          # type-check + production build to dist/
npm run check-secrets  # refuse to publish credentials or customer data
```

### check-secrets

Scans exactly what `git ls-files` reports — the files that actually get
published — for things that must never reach a public repo:

| Rule | Catches |
|---|---|
| `fortios-enc` | `ENC` blobs, which public tools decrypt |
| `fortios-credential` | `set psksecret` / `password` / `auth-password` with a literal value |
| `private-key` | PEM private keys |
| `cloud-token` | AWS, GitHub, and Slack tokens |
| `public-ip` | routable addresses — examples should use [RFC 5737](https://datatracker.ietf.org/doc/html/rfc5737) ranges |
| `denylist` | your own terms, from `.secrets-denylist` |

A `<placeholder>` in place of a credential is fine, which is what templates
are made of. Well-known public resolvers (1.1.1.1, 8.8.8.8, 9.9.9.9) are
allowed. The IP rule is scoped away from `tests/`, where golden fixtures hold
mock resolver results and cannot carry an inline marker without breaking the
byte comparison they exist for — every other rule still applies there.

**Site-specific terms go in `.secrets-denylist`, which is gitignored.**
Committing a denylist of client names and domains would publish the very
strings it exists to protect. One term per line; `#` comments and blanks are
ignored:

```
# .secrets-denylist — never commit this file
examplecorp
example-corp.com
EXCORP-FW
```

A deliberate exception ends its line with `check-secrets-ok`.

It runs in CI on pull requests **and on pushes to `main`** — a direct commit
never opens a PR, which is exactly how a file of pre-shared keys once landed —
and gates the Pages deploy, so a bad paste stops before it is published.

## Adding reference content

Reference sheets are **markdown files** under [`content/reference/`](content/reference/).
Adding a sheet means adding a file — nothing in `src/` changes.

```
content/reference/
├── ipsec-status.md
├── ipsec-templates.md
├── colors.md
└── …
src/lib/reference/
├── types.ts        the content model, plus the Topic and Kind lists
├── markdown.ts     the sheet parser and loader
└── index.ts        assembles every section
```

A sheet is front matter plus content:

````markdown
---
id: ipsec-status          # unique, lowercase, safe in a URL
title: IPsec tunnel status
topic: ipsec              # a value from REFERENCE_TOPICS
kind: diagnostics         # a value from REFERENCE_KINDS
copyAll: true             # optional — adds a "Copy all" button
order: 10                 # optional — lower sorts first, default 100
---

Prose before the first command becomes the note under the title.

`get vpn ipsec tunnel summary` - One line per tunnel
- `diagnose vpn tunnel list` - Bullets work too
`diagnose debug enable`

### A config block

```
config vpn ipsec phase1-interface
    edit "<tunnel-name>"
    next
end
```
````

- a line of the form `` `command` - description `` becomes a copyable row;
  the description is optional, and `-`, `–`, `—` all separate it
- a plain fenced block becomes a config snippet copied whole, titled by the
  `###` heading above it
- ```` ```commands ```` makes every line in the block its own row — handy for
  pasting a sequence you have no descriptions for
- ```` ```colors ```` reads `<id> - <name>` rows and renders a swatch

Markdown is inlined at build time, so the deployed page fetches nothing.
A malformed sheet fails the build and the tests with the filename and the
reason, rather than disappearing silently.

### Quickstart templates

Templates are markdown files under [`content/quickstart/`](content/quickstart/).
Dropping one in adds it to the Templates tab — its title, its card on the
index, and every form field come from the file, so there is no code to write:

````markdown
---
category: vpn                    # site | vpn | policy | maintenance | other
description: One line for the card on the index.
order: 20                        # optional, lower sorts first in its category
---

# My Quickstart

## Variables
- <site-short-name> - Short site name - e.g. TI
- <WAN-port-name> - WAN port name - e.g. wan1

```
config system global
    set hostname "<site-short-name>-FGT"
end
```
````

- the front matter is optional — a template without it still works, and lands
  in the **Other** category
- the first `# ` heading is the title, unless front matter sets one
- each `## Variables` bullet becomes a field — the text after the dash is its
  label, and a trailing `e.g. …` becomes the example and the "Fill example
  values" value
- the fenced block is the config that placeholders are substituted into
- placeholders used in the body but missing from `## Variables` still get a
  field, and are flagged; documented ones the body never uses are flagged too
- markup in config values (`<b>`, `<li>` in a pre-login banner) is left alone

### Public and private builds

This repo is public, and so is anything committed to it. Real build-out
templates usually are not meant to be — they carry site names, addressing,
SNMP communities, and banner text.

So templates split two ways:

| Location | Committed? | Ships in |
|---|---|---|
| `content/quickstart/*.md` | yes | every build — keep these generic |
| `content/quickstart/private/*.md` | **no**, gitignored | only builds made from your working copy |

Both are picked up by the same glob, and private ones are badged and sort
first on the index. A build from a clean clone of this repo contains only the committed
examples — the private directory is not in the repo at all, so there is
nothing to leak.

**Three ways to use a private template:**

1. **Locally** — put it in `content/quickstart/private/` and run `npm run dev`
   or `npm run build`. Never committed, never deployed.
2. **In the browser** — on any deployment, including the public one, open
   **Use a different template** and paste it or load the file. It is saved in
   that browser's `localStorage` and nothing is uploaded: the app makes no
   network requests apart from the optional DNS lookups in Object Helper.
   "Forget saved template" removes it.
3. **A private deployment** — build from a working copy that has the private
   directory and host the `dist/` output somewhere access-controlled. Note
   that GitHub Pages serves publicly even from a private repo unless you are
   on GitHub Enterprise.

Deleting a template from the repo does not remove it from git history. If
something sensitive was committed previously, treat it as disclosed and
rotate it; removing it from history needs a rewrite (`git filter-repo`) plus
a force push, and even then GitHub may keep unreachable objects until asked
to prune them.

**To add a topic or kind**, add one entry to `REFERENCE_TOPICS` or
`REFERENCE_KINDS` in `types.ts`. The union types are derived from those
lists, so the compiler then points at anything that needs updating.

[`tests/reference.test.ts`](tests/reference.test.ts) and
[`tests/reference-markdown.test.ts`](tests/reference-markdown.test.ts) check
the content on every run: front matter present and valid, unique and URL-safe
ids, no empty sections, exactly one of `command`/`text` per entry, colour ids
in range, multi-line snippet bodies, `copyAll` only where there is a sequence
to copy, and no topic or kind left without content (which would leave a dead
dropdown option). Run `npm test` after editing content.

## Deployment

Pushes to `main` build and deploy to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
One-time setup: repo **Settings → Pages → Source: GitHub Actions**.

See [PLAN.md](PLAN.md) for the conversion plan and architecture notes, and
[SPLIT.md](SPLIT.md) for moving to a private archive plus a clean public repo.
