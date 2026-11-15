import { HELP_SUMMARY, pageHelp, type Inline, type PageId } from '../lib/help';
import { el } from './components';

const openKey = (id: PageId) => `fortihelper:help:open:${id}`;

/** Whether this page's panel was left open. Storage can be unavailable. */
function wasOpen(id: PageId): boolean {
  try {
    return localStorage.getItem(openKey(id)) === '1';
  } catch {
    return false;
  }
}

function rememberOpen(id: PageId, open: boolean): void {
  try {
    if (open) localStorage.setItem(openKey(id), '1');
    else localStorage.removeItem(openKey(id));
  } catch {
    // The panel still works; it just starts closed next time.
  }
}

function inlineNode(run: Inline): Node {
  if (run.kind === 'code') return el('code', undefined, run.text);
  if (run.kind === 'text') return document.createTextNode(run.text);
  const a = el('a', undefined, run.text);
  a.href = run.href.replace('{repo}', __REPO_URL__);
  if (!run.href.startsWith('#')) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
}

/**
 * The collapsed "How this page works" panel for a page, built from
 * content/help/<id>.md. Reading matter only: controls never go in here.
 * Closed by default; the open state is remembered per page.
 */
export function helpPanel(id: PageId): HTMLElement | null {
  const help = pageHelp.get(id);
  // tests/help.test.ts fails the build before a page can ship without help.
  if (!help) return null;

  const details = el('details', 'page-help');
  details.open = wasOpen(id);
  details.addEventListener('toggle', () => rememberOpen(id, details.open));
  details.append(el('summary', undefined, HELP_SUMMARY));

  const body = el('div', 'page-help-body');
  for (const section of help.sections) {
    section.paragraphs.forEach((runs, i) => {
      const p = el('p');
      if (i === 0) p.append(el('strong', undefined, section.label), ' ');
      p.append(...runs.map(inlineNode));
      body.append(p);
    });
  }
  details.append(body);
  return details;
}
