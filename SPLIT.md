# Splitting into a private archive and a clean public repo

This repo's history contains things that should not have been published: a
file of VPN pre-shared keys, and a build-out template carrying client names,
addressing, and banner text. Deleting those files removed them from the tree
but not from history, and not from the pull request diffs that touched them.

The plan is therefore:

- **this repo becomes private** — the archive, history and PR threads intact
- **a new public repo is seeded from the current tree with no history** — so
  it never contains any of it

Rotation, not deletion, was the fix for the credentials themselves. That is
done. Everything below is about not repeating it.

---

## Before you start

- [ ] Your private templates are saved somewhere outside this repo
- [ ] `npm run check-secrets` passes on `main`

## Step 1 — Build the clean public repo

Do this **before** making the old repo private, so the published site is never
down.

```bash
git clone https://github.com/nathanbent/FortiNate-beta.git fortinate-public
cd fortinate-public
rm -rf .git          # the whole point — no history comes along
```

Then rename it. The repo name is written down once, in `package.json`:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/nathanbent/fortinate"
}
```

That is the whole rename. The Pages base path and the footer's Source link
both derive from it at build time, so there is nothing else to edit and no way
for the two to disagree.

> The base path is what serves every asset. When it does not match the repo
> name, the site loads blank white with nothing in the console explaining why.
> Deriving it is precisely so that cannot happen by hand.

Confirm it took:

```bash
npm run build
grep -o '"/[A-Za-z-]*/assets' dist/index.html    # expect "/fortinate/assets
```

## Step 2 — Pre-flight, then push

`check-secrets` reads `git ls-files`, so it has to run after `git add`:

```bash
git init
git add -A
npm ci && npm run check-secrets
git ls-files | grep private          # expect no output
```

Both clean, then:

```bash
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:nathanbent/<new-repo>.git
git push -u origin main
```

Then **Settings → Pages → Source: GitHub Actions**. The deploy workflow is
already in the tree and needs no changes.

## Step 3 — Make this repo private

**Settings → General → Danger Zone → Change visibility → Private.**

- On GitHub **Free**, a private repo cannot serve Pages. By this point the new
  repo is live, so that is fine — but do not do this step first unless you are
  happy with downtime.
- Keep this repo rather than deleting it. It is the archive: history, PR
  threads, and the record of what changed.
- It has no forks today. If it ever does, converting to private splits them
  into a separate network and they stay public.

## Step 4 — Where private templates live afterwards

Work happens in the new public repo. Private templates sit in
`content/quickstart/private/`, which is gitignored — the local build picks them
up, the deployed site never sees them.

To version-control them without risking the public repo, clone a small private
repo into that ignored path:

```bash
git clone git@github.com:nathanbent/fortinate-templates.git content/quickstart/private
```

The outer repo ignores the path, so the inner checkout is invisible to it.

Also create `.secrets-denylist` in the new repo — gitignored, one term per line
— with client names, domains, and hostnames, so `check-secrets` catches them by
name rather than only by shape.

## Step 5 — Confirm before sharing the URL

- [ ] The site loads with styling (if it is blank, `base` is wrong)
- [ ] The Templates tab lists **only** *Example — branch office basics*
- [ ] `npm run check-secrets` passes in CI on the new repo

If your own quickstart appears on the deployed site, the private directory came
along. Stop and fix that before giving anyone the link.

---

## What this does and does not achieve

**Does:** the new public repo never contains the keys, the client template, or
any of the history that held them. Going forward, `check-secrets` runs on pull
requests, on pushes to `main`, and ahead of the Pages deploy, so the same
mistake fails the build instead of shipping.

**Does not:** unpublish anything. The old commits and PR diffs were public and
should be assumed captured — GitHub's public event stream is crawled
continuously, and secret-scanning bots watch it specifically. That is why the
pre-shared keys were rotated rather than merely deleted.
