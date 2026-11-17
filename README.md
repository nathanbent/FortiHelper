# &#x1F6E1;&#xFE0F; FortiHelper (beta)

Browser-based generators for FortiGate / FortiOS CLI config. Paste a list,
tweak options, copy the generated config into your FortiGate. Everything runs
client-side: nothing you paste leaves the page (the only network calls are
optional DNS-over-HTTPS lookups when you ask for resolved IP objects).

## Tools

The app opens on a **Home** launcher that groups the tools by what you are
trying to do: build config, change config, look things up. The nav bar
carries the same split as hairline-separated groups.

- **Object Helper**: turn a list of FQDNs, IPs, CIDRs, and IP ranges into
  `config firewall address` objects and address groups, with naming prefixes,
  comments, colors, interfaces, and more. A bulk comment can be added to every
  object, appended to whatever comment it already has. Input can be plain
  lines, name/value pairs, delimited lines, or a straight **paste from
  Excel** (or Google Sheets / LibreOffice): the spreadsheet-paste mode reads
  the tab-separated cells the clipboard carries, auto-detects a header row
  and which columns hold the name, the address, and the comment, and offers
  dropdowns to override any of that per paste. **FortiOS-safe names** (on by
  default) strips `( ) < > ' #` from object names (characters FortiOS
  refuses with "The string contains XSS vulnerability characters"), warning
  with each rename; rows that would make `0.0.0.0/32` objects (what
  exports emit for unconfigured interfaces) are skipped by default with
  one summary warning, or kept (each flagged) when **Skip 0.0.0.0/32
  placeholders** is unticked. Opt-in **Normalization** fixes clean pasted
  URLs (`https://host/path`, `host:port`, defanged `hxxp` / `[.]`) down to
  the bare host, swap rows entered address-first, shorten names over the
  79-character limit (keeping `-IP-1` / `-Group` suffixes and whole
  hostname labels where possible), and rename a name reused for a
  different address to `name-2`, `name-3`, and so on. Each fix that is off but
  would help is offered under **Suggested fixes** below the input, along
  with a better-fitting input mode when the paste plainly has another shape
  (`name: address` lines in one-per-line mode, alternating name / address
  lines, address-first layouts). What the tool corrected is listed under a
  collapsed **Auto-corrected** section rather than as warnings, and exact
  repeats of an entry are noted there too. The example text in the input
  box follows the selected input mode.
- **Webfilter Generator**: turn a domain list into static URL filter entries,
  emitting a complete `config webfilter urlfilter` list by default.
  Types are detected per entry by default (a domain containing `*` is a
  wildcard, anything else is simple) and can be forced to `simple` /
  `wildcard` / `regex`. Supports `block` / `exempt` / `allow` / `monitor`
  actions, per-entry `set exempt` scanning bypasses, list-level
  `set include-subdomains`, and an optional `*` or `*.` wildcard prefix.
  Output as bare entry blocks, numbered `config entries` bodies, or a complete
  `config webfilter urlfilter` list, optionally followed by the
  `config webfilter profile` block that binds it via `set urlfilter-table`.
  For migrating off another vendor's filter, opt-in helpers under Advanced
  accept a per-entry action suffix (`contoso.com-block`, `zombo.com-exempt`,
  with a choice of delimiter), translate other vendors' verbs (deny/drop ->
  block, permit/pass -> allow, warn/log -> monitor, bypass/skip -> exempt), and
  tidy pasted URLs down to bare domains (stripping `https://`, paths, and
  ports).
- **Content Filter**: turn a banned-word list into `config webfilter content`
  entries: `wildcard` / `regexp` pattern types, per-pattern score, language,
  and `block` / `exempt` actions, optionally followed by the
  `config webfilter profile` block that binds it via `set bword-table` and
  `set bword-threshold`. Reports how many matches it takes to block a page.
- **Switch & AP Onboarding**: turn a list of FortiSwitch and FortiAP serial
  numbers into the config that names, groups, and approves them:
  `config switch-controller managed-switch` and
  `config wireless-controller wtp` entries, plus `switch-group` /
  `wtp-group` membership. The list can be a loaded **CSV or .xlsx file**
  (read in the browser: no upload, no dependency), a paste from Excel, or
  rows **added by hand**; **Download CSV template** gives a starter file
  with every column and two example rows. Columns (serial number, name, comments,
  FortiCloud key, and optionally Type, Group, and Profile) are found from
  the header row, or from which column looks like serials, and can be
  re-mapped. Switch or AP is read from the serial's prefix. Options cover
  approve / reject / back to discovered, the FortiLink interface, switch and
  AP groups, and the FortiAP profile (`FAP{model}-default` gives each AP its
  model's default). Comments become the switch `description` and the AP
  `location`. **Switch names** follows the FortiOS version. On 7.4 and
  later, where the switch ID is the name, the default is
  `rename "<serial>" to "<name>"` for switches the FortiGate already
  lists, with `edit "<name>"` + `set sn "<serial>"` for ones not connected yet
  and `set name` for FortiOS 7.2 and earlier;
  APs keep their serial as their ID. Paste the FortiGate's current config
  (the output of four `show` commands the tool lists, or a backup) under
  **Already on the FortiGate** and only what is missing or different is
  generated: devices already as wanted are left out, changed ones get just
  the lines that differ, groups only gain missing members, and anything on
  the FortiGate but not in the list is pointed out. Output is cut into **batches** (50 devices by default), each a
  complete block with its own Copy button that stays ticked once copied;
  group members are added with `append`, so pasting batch 2 does not undo
  batch 1. A **Name pattern** per kind names the rows that have
  none: `IDF-SW{n:2}` gives IDF-SW01, IDF-SW02, and so on, `{gn}` counts
  within a group, and `{serial}`, `{last4}`, `{model}`, and `{group}` fill
  in from the device. Each batch also has a **Copy check** button: run those `show`
  commands after pasting the batch, paste the output under **Check what
  took**, and the batch is marked confirmed, or the devices that are missing
  or still differ are listed. The FortiCloud key is tracked rather than configured: it shows in
  the device table and in the **inventory CSV** export (with each device's
  batch), and only reaches the config if you ask for it in the comment.
- **Interface Range**: the FortiOS stand-in for Cisco's `interface range`.
  List interfaces as ranges and names (`port1-port8, port10-11, x1`; the end
  of a range can repeat the prefix or give just the number), type the
  commands once as you would inside one interface's `edit` block, and they
  are repeated for every interface, wrapped in `config system interface`
  (FortiGate), `config switch-controller managed-switch` / `config ports`
  (FortiLink-managed switches, one block per switch ID), or
  `config switch interface` (standalone FortiSwitch). `{port}`, `{n}`, and
  `{i}` in a command fill in the interface name, its number, and its place in
  the list. Nested `config ... end` blocks keep their indentation and are
  closed if left open, a stray `edit` / `next` / `end` is dropped, and Cisco
  lines such as `switchport access vlan 10` are flagged with the FortiOS
  equivalent.

- **Reference**: curated cheat sheets, collapsed to a scannable index that
  is grouped under topic headings and filtered by topic chips (each showing
  how many sheets the other filters leave under it), a Kind dropdown, and a
  live search: diagnostic command
  lists (with "Copy all" for sequences), multi-line config templates, and the
  FortiGate color-ID table with swatches. Click **+** on any command to add it
  to a selection tray, or **Add all** to take a whole section, then copy the
  lot as one block: a debug sequence can be assembled across several sheets.
  A section whose commands contain `<placeholder>`s gets a **Variables** row
  with one field per placeholder: type a value and it is filled into the
  commands on screen and into everything you copy (single commands, Copy
  all, config blocks, and the tray). A value is shared by every section that
  uses the same placeholder, blanks stay as `<placeholder>`, and nothing is
  saved: values live in memory and are gone on reload. Secret fields such as
  `<pre-shared-key>` are masked and only filled into what you copy, never
  shown on the page. Fields are detected from the commands and config
  blocks, so a new sheet needs nothing extra: reuse an existing placeholder
  name (`<switch-id>`, `<port>`, `<peer-ip>`) where it means the same thing.
  A **Variables** bar above the list gathers every value in play: add a
  variable there to set it before opening any sheet, remove one with its
  **x**, or **Clear all**. Each sheet has a **Link** button that copies a
  `#/reference/<sheet id>` URL, which opens the page scrolled to that sheet
  with it expanded. Search also finds values you have typed in (apart from
  secrets) and highlights every match. A "Copy all" sheet is a sequence, so
  its rows are numbered steps, and any command can carry a **Look for** note
  saying what its output should show. Fields are labelled, given an example
  and lightly checked from a shared catalogue: an IP field warns about
  something that is not an IP, but the value is still filled in.
  Sheets and commands can carry badges for where they are run and which
  FortiOS releases they apply to; enter your **FortiOS version** to hide
  what does not apply (a partial version such as `7.4` only hides what no
  7.4.x release has). The star on a sheet pins it to a **Favourites** group
  at the top, and a **Recent** row links back to the last few sheets opened.
  Both, and the version, are remembered in the browser's `localStorage`:
  sheet ids and a version number only, never the values typed into fields.
  Keyboard: `/` jumps to search, the up and down arrows move through sheets
  and the rows of open ones, left and right close and open a sheet, Enter
  opens a sheet or copies the focused command, and Esc clears the search.
  See
  [Adding reference content](#adding-reference-content).
- **Templates**: fill in a site's details and get the whole build-out config.
  The form is built from the template itself, so your own template works the
  same way. The public build ships only generic examples; see
  [Public and private builds](#public-and-private-builds).

Each tool keeps its everyday settings in view and tucks the rest behind an
**Advanced** section. The header has a Theme control: light, dark, or follow
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

Scans exactly what `git ls-files` reports (the files that actually get
published) for things that must never reach a public repo:

| Rule | Catches |
|---|---|
| `fortios-enc` | `ENC` blobs, which public tools decrypt |
| `fortios-credential` | `set psksecret` / `password` / `auth-password` with a literal value |
| `private-key` | PEM private keys |
| `cloud-token` | AWS, GitHub, and Slack tokens |
| `public-ip` | routable addresses: examples should use [RFC 5737](https://datatracker.ietf.org/doc/html/rfc5737) ranges |
| `denylist` | your own terms, from `.secrets-denylist` |

A `<placeholder>` in place of a credential is fine, which is what templates
are made of. Well-known public resolvers (1.1.1.1, 8.8.8.8, 9.9.9.9) are
allowed. The IP rule is scoped away from `tests/`, where golden fixtures hold
mock resolver results and cannot carry an inline marker without breaking the
byte comparison they exist for: every other rule still applies there.

**Site-specific terms go in `.secrets-denylist`, which is gitignored.**
Committing a denylist of client names and domains would publish the very
strings it exists to protect. One term per line; `#` comments and blanks are
ignored:

```
# .secrets-denylist: never commit this file
examplecorp
example-corp.com
EXCORP-FW
```

A deliberate exception ends its line with `check-secrets-ok`.

It runs in CI on pull requests **and on pushes to `main`** (a direct commit
never opens a PR, which is exactly how a file of pre-shared keys once landed)
and gates the Pages deploy, so a bad paste stops before it is published.

## Adding reference content

Reference sheets are **markdown files** under [`content/reference/`](content/reference/).
Adding a sheet means adding a file: nothing in `src/` changes.

```
content/reference/
|-- ipsec-status.md
|-- ipsec-templates.md
|-- colors.md
`-- ...
src/lib/reference/
|-- types.ts        the content model, plus the Topic and Kind lists
|-- markdown.ts     the sheet parser and loader
`-- index.ts        assembles every section
```

A sheet is front matter plus content:

````markdown
---
id: ipsec-status          # unique, lowercase, safe in a URL
title: IPsec tunnel status
topic: ipsec              # a value from REFERENCE_TOPICS
kind: diagnostics         # a value from REFERENCE_KINDS
copyAll: true             # optional: adds a "Copy all" button
order: 10                 # optional: lower sorts first, default 100
runOn: fortigate          # optional: fortigate | fortiswitch | fortiap, shown as a badge
since: 6.4                # optional: first FortiOS release the sheet applies to
until: 7.6                # optional: first release it no longer applies to
---

Prose before the first command becomes the note under the title.

`get vpn ipsec tunnel summary` - One line per tunnel
> Optional: what to look for in the output of the command above
- `diagnose vpn tunnel list` - Bullets work too
`diagnose debug enable`

## Variables
- <tunnel-name> - Tunnel name - e.g. to-branch

### A config block

```
config vpn ipsec phase1-interface
    edit "<tunnel-name>"
    next
end
```
````

- a line of the form `` `command` - description `` becomes a copyable row;
  the description is optional, and a hyphen, en dash or em dash separates it
- a plain fenced block becomes a config snippet copied whole, titled by the
  `###` heading above it; prose between that heading and the block is shown
  as the snippet's description
- ```` ```commands ```` makes every line in the block its own row: handy for
  pasting a sequence you have no descriptions for
- ```` ```colors ```` reads `<id> - <name>` rows and renders a swatch
- ```` ```table ```` reads `<value> - <meaning>` rows as plain reference
  data with no Copy button: port numbers, wattages, channel lists
- a line starting with `>` straight after a command is shown under it as
  **Look for**: what its output should say, or what to do next
- with `copyAll: true` the commands are a sequence and are numbered as steps
- a description ending in `[7.4+]` marks a command as needing that release
  or later, and `[<7.4]` as only existing before it; the tag becomes a badge
  and feeds the FortiOS version filter, as do `since` and `until` in the
  front matter for a whole sheet
- every `<placeholder>` in a command or config block becomes a field. Its
  label, example and type come from
  [`content/reference-variables.md`](content/reference-variables.md), one
  bullet per placeholder: `- <name> (type) - Label - e.g. example`. The type
  (`ip`, `cidr`, `mask`, `port`, `number`) and the example are optional; a
  placeholder that is not listed is labelled from its name. A sheet's own
  `## Variables` list, in the same form, overrides the shared entry for that
  sheet

Markdown is inlined at build time, so the deployed page fetches nothing.
A malformed sheet fails the build and the tests with the filename and the
reason, rather than disappearing silently.

### Page help

Every page has a collapsed **How this page works** panel under its heading.
Its text is one markdown file per page, `content/help/<page id>.md`, with up
to five sections in a fixed order:

```markdown
## Use it for
The job, and when to pick another page instead.

## Give it
Accepted input, with one short example such as `198.51.100.0/24`.

## You get
What the output is and what to do with it.

## Limits
What it does not handle, and what to check by hand.

## More
[A README section]({repo}#tools) or [another page](#/reference).
```

- leave out a section that would be empty; no other headings are allowed
- a blank line starts a new paragraph, backticks mark code, and
  `[text](target)` is a link to another page (`#/...`), the repository
  (`{repo}`) or an `https://` URL
- the limit is 200 words: anything longer belongs in this README, linked
  under **More**
- the panel is reading matter only. Controls stay on the page, and anything
  a user must know to get correct output is a visible hint as well, because
  most people never open the panel
- change the help in the same commit as the behavior it describes

A new tool's `id` has to be added to `PAGE_IDS` in
[`src/lib/help/index.ts`](src/lib/help/index.ts) before it compiles, and
[`tests/help.test.ts`](tests/help.test.ts) then fails until the page has a
help file. The panel is rendered by the shell in `src/main.ts`, so a tool
does nothing to show it. Whether a panel is open is remembered per page in
`localStorage`.

### Starting a new sheet or template

```bash
npm run new-sheet sslvpn-debug ipsec diagnostics
```

```bash
npm run new-template branch-vpn vpn
```

`new-sheet <id> [topic] [kind]` writes `content/reference/<id>.md` with the
front matter filled in, the next free `order` in that topic, and the format
written out as comments. Topic defaults to `general` and kind to
`diagnostics`. `new-template <id> [category]` does the same for
`content/quickstart/<id>.md`. Both files are valid as written, so the build
keeps passing while you edit, and both refuse to overwrite an existing file.

### Trying a sheet in the browser

The Reference tab's **Add your own sheet** panel takes a sheet in the same
markdown format, pasted or loaded from a `.md` file, with no build or
commit. It appears in its topic group with a **Yours** badge and works like
any other sheet: variables, search, favourites, deep links. It is saved in
that browser's `localStorage` and never uploaded, so it suits a draft you
are still writing or a sheet that should stay private. Each saved sheet can
be edited, copied back out as markdown (to commit later), or removed. An id
that a built-in sheet already uses is refused; reusing one of your own ids
replaces that sheet. Your own sheets are not part of `reference.json`.

### Using the content elsewhere

The build also writes the content as plain JSON next to the site, so other
projects can use it without this app's markdown parsers:

| File | Holds |
|---|---|
| `reference.json` | every sheet (commands, notes, snippets, version limits, placeholders), the topic and kind lists, and the shared variable catalogue |
| `templates.json` | every committed quickstart template: title, category, variables, and the config body |

They are served from the site root, for example
`https://<user>.github.io/<repo>/reference.json`, and GitHub Pages allows
cross-origin requests, so a script or another web app can fetch them
directly. `npm run dev` serves them at the same paths, and the Reference tab
links to `reference.json`. Each file carries `format` and `version`; the
version only changes when a field is renamed or removed, so ignore keys you
do not recognise. Templates under `content/quickstart/private/` are never
exported. The shapes are defined in
[`src/lib/export.ts`](src/lib/export.ts).

### Quickstart templates

Templates are markdown files under [`content/quickstart/`](content/quickstart/).
Dropping one in adds it to the Templates tab: its title, its card on the
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

- the front matter is optional: a template without it still works, and lands
  in the **Other** category
- the first `# ` heading is the title, unless front matter sets one
- each `## Variables` bullet becomes a field: the text after the dash is its
  label, and a trailing `e.g. ...` becomes the example and the "Fill example
  values" value
- the fenced block is the config that placeholders are substituted into
- placeholders used in the body but missing from `## Variables` still get a
  field, and are flagged; documented ones the body never uses are flagged too
- markup in config values (`<b>`, `<li>` in a pre-login banner) is left alone

### Public and private builds

This repo is public, and so is anything committed to it. Real build-out
templates usually are not meant to be: they carry site names, addressing,
SNMP communities, and banner text.

So templates split two ways:

| Location | Committed? | Ships in |
|---|---|---|
| `content/quickstart/*.md` | yes | every build: keep these generic |
| `content/quickstart/private/*.md` | **no**, gitignored | only builds made from your working copy |

Both are picked up by the same glob, and private ones are badged and sort
first on the index. A build from a clean clone of this repo contains only the committed
examples: the private directory is not in the repo at all, so there is
nothing to leak.

**Three ways to use a private template:**

1. **Locally**: put it in `content/quickstart/private/` and run `npm run dev`
   or `npm run build`. Never committed, never deployed.
2. **In the browser**: on any deployment, including the public one, open
   **Use a different template** and paste it or load the file. It is saved in
   that browser's `localStorage` and nothing is uploaded: the app makes no
   network requests apart from the optional DNS lookups in Object Helper.
   "Forget saved template" removes it.
3. **A private deployment**: build from a working copy that has the private
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

## About page and changelog

The footer shows the version, and it and the last tab in the nav link to an
About page (`#/about`): version,
the commit the build was made from, a link to the author's site, and the
changelog.

- **Version** comes from `version` in `package.json`; the commit and its date
  are read from git at build time.
- **Changelog** is [`CHANGELOG.md`](CHANGELOG.md). Add a `## YYYY-MM-DD`
  heading with plain-text `- ` bullets; `npm test` checks the shape.
- **Photo**: drop a file named `cat.jpg` (or `.jpeg`, `.png`, `.webp`,
  `.avif`) into `src/assets/` and it appears on the page. With no file there,
  the section is left out.

## Deployment

Pushes to `main` build and deploy to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
One-time setup: repo **Settings -> Pages -> Source: GitHub Actions**.

See [PLAN.md](PLAN.md) for the conversion plan and architecture notes, and
[SPLIT.md](SPLIT.md) for moving to a private archive plus a clean public repo.
