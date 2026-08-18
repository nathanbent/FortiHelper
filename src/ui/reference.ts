import type { Tool } from '../types';
import { el, selectField, setShown } from './components';
import { colorHex } from '../lib/colors';
import {
  referenceSections,
  REFERENCE_TOPICS,
  REFERENCE_KINDS,
  topicLabel,
  kindLabel,
  sectionItemCount,
  type ReferenceEntry,
  type ReferenceSection,
  type ReferenceSnippet,
} from '../lib/reference';

/** Wire a button to copy `text`, with brief "✓" feedback like outputPane. */
function copyButton(label: string, getText: () => string): HTMLButtonElement {
  const btn = el('button', 'btn', label);
  btn.addEventListener('click', async (event) => {
    // Copy buttons live inside <summary>, where a click would toggle the section.
    event.preventDefault();
    event.stopPropagation();
    await navigator.clipboard.writeText(getText());
    const original = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => (btn.textContent = original), 1200);
  });
  return btn;
}

/** True when the entry matches the (already lowercased) query. */
function entryMatches(entry: ReferenceEntry, query: string): boolean {
  if (!query) return true;
  const haystack =
    `${entry.command ?? ''} ${entry.text ?? ''} ${entry.description ?? ''}`.toLowerCase();
  return haystack.includes(query);
}

function snippetMatches(snippet: ReferenceSnippet, query: string): boolean {
  if (!query) return true;
  return `${snippet.title} ${snippet.description ?? ''} ${snippet.body}`
    .toLowerCase()
    .includes(query);
}

/** A section's own text, so a search can match the section even when no row does. */
function sectionMatches(section: ReferenceSection, query: string): boolean {
  if (!query) return true;
  return `${section.title} ${section.description ?? ''} ${topicLabel(section.topic)} ${kindLabel(
    section.kind,
  )}`
    .toLowerCase()
    .includes(query);
}

export const referenceTool: Tool = {
  id: 'reference',
  title: 'Reference',
  description:
    'Curated FortiGate / FortiSwitch cheat sheets. Pick a topic and a kind, or search across everything.',
  mount(container) {
    let topic = 'all';
    let kind = 'all';
    let query = '';
    /** Sections the user opened by hand, so filtering does not fight them. */
    const userOpened = new Set<string>();

    // ---------- filters ----------
    const filters = el('section', 'panel ref-filters');
    const row = el('div', 'field-row');

    const searchField = el('div', 'field');
    searchField.append(el('label', undefined, 'Search'));
    const search = el('input', 'ref-search');
    search.type = 'search';
    search.placeholder = 'Command or description…';
    search.addEventListener('input', () => {
      query = search.value.trim().toLowerCase();
      applyFilter();
    });
    searchField.append(search);

    row.append(
      selectField(
        'Topic',
        [{ value: 'all', label: 'All topics' }, ...REFERENCE_TOPICS],
        topic,
        (v) => {
          topic = v;
          applyFilter();
        },
      ),
      selectField(
        'Kind',
        [{ value: 'all', label: 'All kinds' }, ...REFERENCE_KINDS],
        kind,
        (v) => {
          kind = v;
          applyFilter();
        },
      ),
      searchField,
    );

    const summary = el('div', 'ref-summary', '');
    const expandBtn = el('button', 'btn', 'Expand all');
    expandBtn.addEventListener('click', () => {
      // Expand everything visible, or collapse back if it is already expanded.
      const visible = rendered.filter(({ panel }) => !panel.hidden);
      const expanding = visible.some(({ panel }) => !panel.open);
      for (const { section, panel } of visible) {
        panel.open = expanding;
        if (expanding) userOpened.add(section.id);
        else userOpened.delete(section.id);
      }
      expandBtn.textContent = expanding ? 'Collapse all' : 'Expand all';
    });

    const summaryRow = el('div', 'ref-summary-row');
    summaryRow.append(summary, expandBtn);
    filters.append(row, summaryRow);
    container.append(filters);

    // ---------- selection tray ----------
    // Commands picked from anywhere on the page, in the order they were
    // added, so a debug sequence can be assembled across several sheets.
    const picked: string[] = [];
    /** Every add-button for a command, so Clear can reset them all. */
    const addButtons = new Map<string, HTMLButtonElement[]>();

    const tray = el('div', 'ref-tray');
    const trayCount = el('span', 'ref-tray-count', '');
    const trayList = el('pre', 'output ref-tray-list', '');
    const trayToggle = el('button', 'btn', 'Show');
    const trayCopy = copyButton('Copy selected', () => picked.join('\n'));
    trayCopy.classList.add('primary');
    const trayClear = el('button', 'btn', 'Clear');

    let trayOpen = false;
    trayToggle.addEventListener('click', () => {
      trayOpen = !trayOpen;
      trayToggle.textContent = trayOpen ? 'Hide' : 'Show';
      setShown(trayList, trayOpen);
    });
    trayClear.addEventListener('click', () => {
      picked.length = 0;
      syncTray();
    });

    const trayBar = el('div', 'ref-tray-bar');
    trayBar.append(trayCount, trayToggle, trayCopy, trayClear);
    tray.append(trayList, trayBar);
    setShown(trayList, false);
    // Appended at the end of the tool container, not to <body>: the shell
    // replaces the container on navigation, so a body-level tray would
    // outlive the tab. Sticky keeps it in view while scrolling the list.

    function syncTray(): void {
      const any = picked.length > 0;
      setShown(tray, any);
      trayCount.textContent = `${picked.length} command${picked.length === 1 ? '' : 's'}`;
      trayList.textContent = picked.join('\n');
      if (!any && trayOpen) {
        trayOpen = false;
        trayToggle.textContent = 'Show';
        setShown(trayList, false);
      }
      // Reflect membership on every button for that command.
      for (const [cmd, buttons] of addButtons) {
        const on = picked.includes(cmd);
        for (const b of buttons) {
          b.textContent = on ? '✓' : '+';
          b.classList.toggle('primary', on);
          b.title = on ? 'Remove from selection' : 'Add to selection';
        }
      }
    }

    function toggleCommand(cmd: string): void {
      const at = picked.indexOf(cmd);
      if (at === -1) picked.push(cmd);
      else picked.splice(at, 1);
      syncTray();
    }

    /** Add every command in a section that the current filter leaves visible. */
    function addAll(commands: { cmd: string; row: HTMLElement }[]): void {
      for (const { cmd, row } of commands) {
        if (row.hidden) continue;
        if (!picked.includes(cmd)) picked.push(cmd);
      }
      syncTray();
    }

    // ---------- sections ----------
    const rendered: {
      section: ReferenceSection;
      panel: HTMLDetailsElement;
      rows: { row: HTMLElement; matches: (q: string) => boolean }[];
    }[] = [];

    for (const section of referenceSections) {
      const panel = el('details', 'panel ref-section');
      panel.id = `ref-${section.id}`;

      const head = el('summary', 'ref-summary-head');
      const heading = el('div', 'ref-heading');
      heading.append(el('span', 'ref-title', section.title));
      const count = sectionItemCount(section);
      heading.append(
        el('span', 'ref-tag', `${topicLabel(section.topic)} · ${count} item${count === 1 ? '' : 's'}`),
      );
      head.append(heading);

      if (section.copyAll && section.entries) {
        const block = section.entries
          .map((e) => e.command)
          .filter((c): c is string => c !== undefined)
          .join('\n');
        head.append(copyButton('Copy all', () => block));
      }
      panel.append(head);

      const body = el('div', 'ref-body');
      if (section.description) body.append(el('p', 'ref-note', section.description));

      const rows: { row: HTMLElement; matches: (q: string) => boolean }[] = [];
      /** Commands in this section, for its "Add all" button. */
      const sectionCommands: { cmd: string; row: HTMLElement }[] = [];

      for (const entry of section.entries ?? []) {
        const line = el('div', 'ref-entry');
        if (entry.swatch !== undefined) {
          const swatch = el('span', 'swatch');
          swatch.style.background = colorHex(entry.swatch) ?? 'transparent';
          line.append(swatch);
        }
        line.append(el('code', undefined, entry.command ?? entry.text ?? ''));
        if (entry.description) line.append(el('span', 'desc', entry.description));
        if (entry.command !== undefined) {
          const cmd = entry.command;
          const add = el('button', 'btn ref-add', '+');
          add.title = 'Add to selection';
          add.addEventListener('click', () => toggleCommand(cmd));
          addButtons.set(cmd, [...(addButtons.get(cmd) ?? []), add]);
          line.append(add, copyButton('Copy', () => cmd));
          sectionCommands.push({ cmd, row: line });
        }
        body.append(line);
        rows.push({ row: line, matches: (q) => entryMatches(entry, q) });
      }

      for (const snippet of section.snippets ?? []) {
        const card = el('div', 'ref-snippet');
        const snipHead = el('div', 'ref-snippet-head');
        snipHead.append(el('strong', undefined, snippet.title));
        snipHead.append(copyButton('Copy', () => snippet.body));
        card.append(snipHead);
        if (snippet.description) card.append(el('span', 'desc', snippet.description));
        card.append(el('pre', 'output', snippet.body));
        body.append(card);
        rows.push({ row: card, matches: (q) => snippetMatches(snippet, q) });
      }

      if (sectionCommands.length > 1) {
        const addAllBtn = el('button', 'btn', 'Add all');
        addAllBtn.title = 'Add every command in this section to the selection';
        addAllBtn.addEventListener('click', (event) => {
          // Lives in the summary, where a click would toggle the section.
          event.preventDefault();
          event.stopPropagation();
          addAll(sectionCommands);
        });
        head.append(addAllBtn);
      }

      panel.append(body);
      // Tracked on click rather than `toggle`: the toggle event is queued
      // asynchronously, so it fires after a programmatic open and would record
      // our own filtering as user intent. A click covers keyboard activation
      // too, and Copy buttons in the summary stop propagation.
      head.addEventListener('click', () => {
        // The default action flips `open` after this handler runs.
        if (panel.open) userOpened.delete(section.id);
        else userOpened.add(section.id);
      });

      container.append(panel);
      rendered.push({ section, panel, rows });
    }

    const noMatches = el('p', 'ref-note', 'Nothing matches those filters.');
    container.append(noMatches, tray);

    function applyFilter(): void {
      let visibleSections = 0;
      let visibleItems = 0;

      for (const { section, panel, rows } of rendered) {
        const inScope =
          (topic === 'all' || section.topic === topic) && (kind === 'all' || section.kind === kind);

        // A query matching the section title keeps all its rows, so a search
        // for "IPsec" shows whole sheets rather than stripping them to nothing.
        const wholeSection = sectionMatches(section, query);
        let visibleRows = 0;
        for (const { row, matches } of rows) {
          const show = wholeSection || matches(query);
          setShown(row, show);
          if (show) visibleRows++;
        }

        const show = inScope && visibleRows > 0;
        setShown(panel, show);
        if (show) {
          visibleSections++;
          visibleItems += visibleRows;
          // Searching should reveal what it found; otherwise respect the user.
          panel.open = query !== '' || userOpened.has(section.id);
        }
      }

      setShown(noMatches, visibleSections === 0);
      summary.textContent = visibleSections
        ? `${visibleSections} sheet${visibleSections === 1 ? '' : 's'} · ${visibleItems} item${
            visibleItems === 1 ? '' : 's'
          }`
        : '';
      setShown(expandBtn, visibleSections > 0);
      expandBtn.textContent = rendered.some(({ panel }) => !panel.hidden && !panel.open)
        ? 'Expand all'
        : 'Collapse all';
    }

    applyFilter();
    syncTray();
  },
};
