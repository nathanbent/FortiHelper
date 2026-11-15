import type { Tool } from '../types';
import { changelog, type ChangelogEntry } from '../lib/changelog';
import { el } from './components';

const AUTHOR_SITE = 'https://natebent.com';

/** Changelog entries shown before the rest fold under "Earlier changes". */
const RECENT_ENTRIES = 3;

/**
 * An optional photo. Drop a file named `cat` (jpg, jpeg, png, webp, or avif)
 * into src/assets/ and it appears on the page; with no file there the
 * section is simply left out, so the build never depends on it.
 */
const catPhoto = Object.values(
  import.meta.glob('../assets/cat.{jpg,jpeg,png,webp,avif}', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
)[0];

function link(href: string, text: string): HTMLAnchorElement {
  const a = el('a', undefined, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/** A paragraph built from strings and nodes. */
function para(...parts: (string | Node)[]): HTMLParagraphElement {
  const p = el('p');
  p.append(...parts);
  return p;
}

function buildPanel(): HTMLElement {
  const panel = el('section', 'panel about-panel');
  panel.append(el('h2', undefined, 'This build'));

  const facts = el('dl', 'about-facts');
  const row = (term: string, value: string | Node) => {
    const dd = el('dd');
    dd.append(value);
    facts.append(el('dt', undefined, term), dd);
  };
  row('Version', `${__APP_VERSION__} (beta)`);
  // Empty when the build ran outside a git checkout.
  if (__BUILD_COMMIT__) {
    const commit = link(`${__REPO_URL__}/commit/${__BUILD_COMMIT__}`, __BUILD_COMMIT__.slice(0, 7));
    commit.className = 'about-mono';
    row('Commit', commit);
  }
  if (__BUILD_DATE__) row('Last change', __BUILD_DATE__);
  panel.append(facts);
  return panel;
}

function aboutPanel(): HTMLElement {
  const panel = el('section', 'panel about-panel');
  panel.append(el('h2', undefined, 'About'));
  panel.append(
    para(
      'FortiHelper is a set of small tools for the repetitive parts of FortiGate work: ' +
        'turning lists into CLI config, bulk-editing config you already have, and keeping ' +
        'the diagnostic commands you always end up searching for in one place.',
    ),
    para('Built and maintained by Nate Bent. More at ', link(AUTHOR_SITE, 'natebent.com'), '.'),
    para(
      'Everything runs in your browser. Nothing you paste is uploaded; the one exception is ' +
        'the optional DNS lookup, which sends hostnames to a DNS-over-HTTPS resolver.',
    ),
    para(
      'It is a beta, and it writes config for devices that matter. Read what it generates ' +
        'before pasting it into anything in production.',
    ),
  );

  const links = el('p', 'about-links');
  links.append(
    link(AUTHOR_SITE, 'natebent.com'),
    link(__REPO_URL__, 'Source on GitHub'),
    link(`${__REPO_URL__}/issues`, 'Report a problem'),
  );
  panel.append(links);

  panel.append(
    el(
      'p',
      'ref-note about-legal',
      'An independent project, not affiliated with or endorsed by Fortinet. Fortinet, ' +
        'FortiGate, FortiOS, FortiSwitch, and FortiAP are trademarks of Fortinet, Inc.',
    ),
  );
  return panel;
}

function catPanel(src: string): HTMLElement {
  const figure = el('figure', 'panel about-cat');
  const img = el('img');
  img.src = src;
  img.alt = 'The cat who supervises development';
  img.loading = 'lazy';
  figure.append(img, el('figcaption', undefined, 'Head of quality assurance.'));
  return figure;
}

function changelogEntry(entry: ChangelogEntry): HTMLElement {
  const wrap = el('div', 'about-change');
  wrap.append(el('h3', undefined, entry.title));
  const list = el('ul');
  for (const item of entry.items) list.append(el('li', undefined, item));
  wrap.append(list);
  return wrap;
}

function changelogPanel(): HTMLElement {
  const panel = el('section', 'panel about-panel');
  panel.append(el('h2', undefined, 'What’s new'));
  for (const entry of changelog.slice(0, RECENT_ENTRIES)) panel.append(changelogEntry(entry));

  const older = changelog.slice(RECENT_ENTRIES);
  if (older.length) {
    const details = el('details', 'about-older');
    details.append(el('summary', undefined, `Earlier changes (${older.length})`));
    for (const entry of older) details.append(changelogEntry(entry));
    panel.append(details);
  }
  return panel;
}

export const aboutTool: Tool = {
  id: 'about',
  title: 'About',
  description: 'What this is, who made it, and what changed lately.',
  mount(container) {
    const layout = el('div', 'about-layout');
    const side = el('div', 'about-side');
    side.append(buildPanel());
    if (catPhoto) side.append(catPanel(catPhoto));
    const mainCol = el('div');
    mainCol.append(aboutPanel(), changelogPanel());
    layout.append(mainCol, side);
    container.append(layout);
  },
};
