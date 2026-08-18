import type { Tool } from '../types';
import { el } from './components';
import { quickstartPanel, loadSavedTemplate } from './quickstart';
import { loadTemplates } from '../lib/quickstart/templates';
import { TEMPLATE_CATEGORIES, parseQuickstart } from '../lib/quickstart';

const templates = loadTemplates();

/** The id used for a template pasted into the page rather than shipped with it. */
const SAVED_ID = 'saved';

/** Card for one template on the index. */
function templateCard(
  id: string,
  title: string,
  description: string,
  meta: string,
  badge?: string,
): HTMLElement {
  const card = el('a', 'tpl-card');
  card.href = `#/quickstart/${id}`;

  const head = el('div', 'tpl-card-head');
  head.append(el('span', 'tpl-card-title', title));
  if (badge) head.append(el('span', 'tpl-badge', badge));
  card.append(head);

  if (description) card.append(el('p', 'tpl-card-desc', description));
  card.append(el('span', 'tpl-card-meta', meta));
  return card;
}

function fieldCount(count: number): string {
  return `${count} field${count === 1 ? '' : 's'}`;
}

export const quickstartTool: Tool = {
  id: 'quickstart',
  title: 'Templates',
  description:
    'Fill in a site’s details and get the whole build-out config. Fields come from the template itself, so your own template works the same way.',
  mount(container, param) {
    const saved = loadSavedTemplate();

    // ---------- detail view ----------
    if (param) {
      const chosen =
        param === SAVED_ID
          ? saved?.trim()
            ? { markdown: saved, title: parseQuickstart(saved).title }
            : undefined
          : templates.find((t) => t.id === param);

      if (!chosen) {
        const missing = el('section', 'panel');
        missing.append(el('p', 'ref-note', 'That template is no longer available.'));
        container.append(backLink(), missing);
        return;
      }

      container.append(backLink());
      container.append(quickstartPanel(chosen.markdown));
      return;
    }

    // ---------- index ----------
    const groups: { label: string; cards: HTMLElement[] }[] = [];

    if (saved?.trim()) {
      const parsed = parseQuickstart(saved);
      groups.push({
        label: 'Saved in this browser',
        cards: [
          templateCard(
            SAVED_ID,
            parsed.title,
            parsed.description || 'A template you pasted or loaded here. Stored locally only.',
            fieldCount(parsed.variables.length),
            'yours',
          ),
        ],
      });
    }

    for (const { value, label } of TEMPLATE_CATEGORIES) {
      const inCategory = templates.filter((t) => t.parsed.category === value);
      if (!inCategory.length) continue;
      groups.push({
        label,
        cards: inCategory.map((t) =>
          templateCard(
            t.id,
            t.parsed.title,
            t.parsed.description,
            fieldCount(t.parsed.variables.length),
            t.private ? 'private' : undefined,
          ),
        ),
      });
    }

    if (!groups.length) {
      const empty = el('section', 'panel');
      empty.append(
        el(
          'p',
          'ref-note',
          'No templates yet. Add a markdown file under content/quickstart/, or open any template and paste your own.',
        ),
      );
      container.append(empty);
      return;
    }

    for (const group of groups) {
      const section = el('section', 'panel');
      section.append(el('h2', undefined, group.label));
      const grid = el('div', 'tpl-grid');
      grid.append(...group.cards);
      section.append(grid);
      container.append(section);
    }

    const note = el('p', 'ref-note tpl-footnote', '');
    note.append(
      document.createTextNode('Templates live in '),
      el('code', undefined, 'content/quickstart/'),
      document.createTextNode('. Anything under '),
      el('code', undefined, 'private/'),
      document.createTextNode(
        ' is gitignored and never published — or paste one into any template page to keep it in this browser only.',
      ),
    );
    container.append(note);
  },
};

/** "All templates" link back to the index. */
function backLink(): HTMLElement {
  const row = el('div', 'btn-row');
  const link = el('a', 'btn', '← All templates');
  link.href = '#/quickstart';
  row.append(link);
  return row;
}
