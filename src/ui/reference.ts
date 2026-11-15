import type { Tool } from '../types';
import { el, selectField, setShown } from './components';
import { colorHex } from '../lib/colors';
import {
  referenceSections,
  REFERENCE_TOPICS,
  groupByTopic,
  REFERENCE_KINDS,
  topicLabel,
  kindLabel,
  sectionItemCount,
  type ReferenceEntry,
  type ReferenceSection,
  type ReferenceSnippet,
  fillParts,
  fillPlaceholders,
  isSecretPlaceholder,
  checkVariableValue,
  describeVariable,
  markMatches,
  sharedVariables,
  type FilledPart,
  placeholdersIn,
  sectionPlaceholders,
} from '../lib/reference';

/** Wire a button to copy `text`, with brief check-mark feedback like outputPane. */
function copyButton(label: string, getText: () => string): HTMLButtonElement {
  const btn = el('button', 'btn', label);
  btn.addEventListener('click', async (event) => {
    // Copy buttons live inside <summary>, where a click would toggle the section.
    event.preventDefault();
    event.stopPropagation();
    await navigator.clipboard.writeText(getText());
    const original = btn.textContent;
    btn.textContent = '\u2713';
    setTimeout(() => (btn.textContent = original), 1200);
  });
  return btn;
}

/** Substitutes entered values, so a search also finds what was typed in. */
type Fill = (text: string) => string;

/**
 * True when the entry matches the (already lowercased) query, either as
 * written in the sheet or with the entered values filled in.
 */
function entryMatches(entry: ReferenceEntry, query: string, fill: Fill): boolean {
  if (!query) return true;
  const command = entry.command ?? '';
  const haystack = `${command} ${fill(command)} ${entry.text ?? ''} ${entry.description ?? ''} ${
    entry.expect ?? ''
  }`.toLowerCase();
  return haystack.includes(query);
}

function snippetMatches(snippet: ReferenceSnippet, query: string, fill: Fill): boolean {
  if (!query) return true;
  return `${snippet.title} ${snippet.description ?? ''} ${snippet.body} ${fill(snippet.body)}`
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
  mount(container, param) {
    let topic = 'all';
    let kind = 'all';
    let query = '';
    /** Sections the user opened by hand, so filtering does not fight them. */
    const userOpened = new Set<string>();
    // `#/reference/<sheet id>` opens straight to that sheet.
    const linked = referenceSections.find((s) => s.id === param);
    if (linked) userOpened.add(linked.id);

    // ---------- filters ----------
    const filters = el('section', 'panel ref-filters');
    const row = el('div', 'field-row');

    const searchField = el('div', 'field');
    searchField.append(el('label', undefined, 'Search'));
    const search = el('input', 'ref-search');
    search.type = 'search';
    search.placeholder = 'Command or description...';
    search.addEventListener('input', () => {
      query = search.value.trim().toLowerCase();
      for (const v of views) renderView(v);
      applyFilter();
    });
    searchField.append(search);

    // Topics are chips rather than a dropdown: all of them are visible at
    // once, each with how many sheets the other filters leave under it.
    const chips = el('div', 'ref-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Topic');
    const topicChips: { value: string; label: string; button: HTMLButtonElement }[] = [];
    for (const { value, label } of [{ value: 'all', label: 'All' }, ...REFERENCE_TOPICS]) {
      const button = el('button', 'btn ref-chip', label);
      button.addEventListener('click', () => {
        topic = value;
        applyFilter();
      });
      topicChips.push({ value, label, button });
      chips.append(button);
    }

    row.append(
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
    filters.append(chips, row, summaryRow);
    container.append(filters);

    // ---------- variables ----------
    // Values typed into a section's variable fields, keyed by placeholder
    // (`<switch-id>`). Shared across sections, so a value entered once fills
    // that placeholder everywhere. Held in memory only: nothing is written
    // to storage, and the map is gone when the tab is left or reloaded.
    const values = new Map<string, string>();
    /** `values` without secrets: what is safe to draw on screen. */
    const shownValues = new Map<string, string>();
    /** Every field for a placeholder, so the same one in other sections follows. */
    const varInputs = new Map<string, { input: HTMLInputElement; check: () => void }[]>();
    /**
     * Every piece of sheet text on the page. Redrawn to highlight search
     * matches, and, for those marked `fill`, when a value they use changes.
     */
    const views: { node: HTMLElement; template: string; fill: boolean }[] = [];

    const fillShown: Fill = (text) => fillPlaceholders(text, shownValues);

    /** Text runs as nodes: filled-in values and search matches are marked. */
    function partNodes(parts: FilledPart[]): Node[] {
      return parts.map((part) => {
        if (part.placeholder === undefined && !part.match) return document.createTextNode(part.text);
        const classes = [part.placeholder !== undefined && 'ref-filled', part.match && 'ref-hit'];
        const mark = el('mark', classes.filter(Boolean).join(' '), part.text);
        if (part.placeholder !== undefined) mark.title = part.placeholder;
        return mark;
      });
    }

    function renderView({ node, template, fill }: (typeof views)[number]): void {
      const parts = fill ? fillParts(template, shownValues) : [{ text: template }];
      node.replaceChildren(...partNodes(markMatches(parts, query)));
    }

    /**
     * An element showing sheet text, kept in step with the search and, when
     * `fill` is set, with the entered values.
     */
    function view<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      className: string | undefined,
      template: string,
      fill = false,
    ): HTMLElementTagNameMap[K] {
      const node = el(tag, className, template);
      views.push({ node, template, fill: fill && placeholdersIn(template).length > 0 });
      return node;
    }

    function setValue(name: string, value: string, source?: HTMLInputElement): void {
      values.set(name, value);
      if (!isSecretPlaceholder(name)) shownValues.set(name, value);
      for (const { input, check } of varInputs.get(name) ?? []) {
        if (input !== source) input.value = value;
        check();
      }
      for (const v of views) {
        if (v.fill && v.template.includes(name)) renderView(v);
      }
      // A field stays in the bar once added, even if emptied while typing:
      // only its remove button or "Clear all" takes it out.
      if (value.trim()) addBarField(name);
      syncBar();
      syncTray();
      // What was typed may be what the search is looking for.
      if (query) applyFilter();
    }

    /**
     * A labelled input for one placeholder, kept in step with every other
     * one. Its label, example and type come from the sheet it sits in, else
     * from the shared catalogue.
     */
    function variableField(
      name: string,
      section?: ReferenceSection,
    ): { field: HTMLLabelElement; input: HTMLInputElement } {
      const secret = isSecretPlaceholder(name);
      const info = describeVariable(name, sharedVariables, section);
      const field = el('label', 'ref-var');
      const label = el('span', undefined, info.label);
      label.title = name;
      field.append(label);
      const input = el('input');
      input.type = secret ? 'password' : 'text';
      input.placeholder = info.example ? `e.g. ${info.example}` : name;
      input.value = values.get(name) ?? '';
      input.autocomplete = secret ? 'new-password' : 'off';
      input.spellcheck = false;
      if (secret) input.title = 'Kept off the screen: filled in only in what you copy';

      // Advisory only: a value that fails the check is still filled in.
      const warn = el('small', 'ref-var-warn', '');
      const check = (): void => {
        const problem = secret ? null : checkVariableValue(info.type, input.value);
        warn.textContent = problem ?? '';
        setShown(warn, problem !== null);
        if (problem) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      };
      check();

      input.addEventListener('input', () => setValue(name, input.value, input));
      varInputs.set(name, [...(varInputs.get(name) ?? []), { input, check }]);
      field.append(input, warn);
      return { field, input };
    }

    /** The row of variable fields for a section, or null when it has none. */
    function variableFields(section: ReferenceSection): HTMLElement | null {
      const names = sectionPlaceholders(section);
      if (names.length === 0) return null;
      const wrap = el('div', 'ref-vars');
      const head = el('div', 'ref-vars-head');
      head.append(el('span', 'ref-vars-title', 'Variables'));
      head.append(
        el('span', 'ref-vars-hint', 'Fill in to complete the commands below. Not saved anywhere.'),
      );
      const clear = el('button', 'btn', 'Clear');
      clear.addEventListener('click', () => {
        for (const name of names) setValue(name, '');
      });
      head.append(clear);

      const fields = el('div', 'ref-vars-fields');
      for (const name of names) fields.append(variableField(name, section).field);
      wrap.append(head, fields);
      return wrap;
    }

    // ---------- page-level variables bar ----------
    // One place to see and set every value in play. A field appears here as
    // soon as its placeholder gets a value anywhere, or when picked from the
    // "Add" list, so values can be set up front before opening any sheet.
    const barLabel = (name: string): string => describeVariable(name, sharedVariables).label;
    const allPlaceholders = [...new Set(referenceSections.flatMap(sectionPlaceholders))].sort(
      (a, b) => barLabel(a).localeCompare(barLabel(b)),
    );
    const bar = el('section', 'panel ref-varbar');
    const barHead = el('div', 'ref-vars-head');
    const barCount = el('span', 'ref-vars-hint', '');
    const barAdd = el('select', 'ref-varbar-add');
    barAdd.setAttribute('aria-label', 'Add a variable');
    const barClear = el('button', 'btn', 'Clear all');
    barHead.append(el('span', 'ref-vars-title', 'Variables'), barCount, barAdd, barClear);
    const barFieldsEl = el('div', 'ref-vars-fields');
    bar.append(barHead, barFieldsEl);
    container.append(bar);

    /** Fields currently in the bar, by placeholder. */
    const barFields = new Map<string, { field: HTMLElement; input: HTMLInputElement }>();

    function syncBar(): void {
      const set = [...values.values()].filter((v) => v.trim()).length;
      barCount.textContent = set
        ? `${set} set \u00b7 filled into every sheet \u00b7 not saved anywhere`
        : 'Set a value once and it is filled into every sheet that uses it. Not saved anywhere.';
      setShown(barFieldsEl, barFields.size > 0);
      setShown(barClear, barFields.size > 0);

      const placeholder = el('option', undefined, 'Add a variable\u2026');
      placeholder.value = '';
      barAdd.replaceChildren(
        placeholder,
        ...allPlaceholders
          .filter((name) => !barFields.has(name))
          .map((name) => {
            const option = el('option', undefined, barLabel(name));
            option.value = name;
            return option;
          }),
      );
      barAdd.value = '';
      setShown(barAdd, barAdd.options.length > 1);
    }

    function addBarField(name: string): HTMLInputElement {
      const existing = barFields.get(name);
      if (existing) return existing.input;
      const { field, input } = variableField(name);
      const remove = el('button', 'btn ref-var-remove', '\u00d7');
      remove.title = `Clear ${barLabel(name)} and remove it from this bar`;
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', (event) => {
        // Inside a <label>: without this the click would refocus the input.
        event.preventDefault();
        removeBarField(name);
        setValue(name, '');
      });
      field.querySelector('span')?.append(remove);
      barFields.set(name, { field, input });
      barFieldsEl.append(field);
      syncBar();
      return input;
    }

    function removeBarField(name: string): void {
      const entry = barFields.get(name);
      if (!entry) return;
      entry.field.remove();
      barFields.delete(name);
      varInputs.set(name, (varInputs.get(name) ?? []).filter((i) => i.input !== entry.input));
      syncBar();
    }

    barAdd.addEventListener('change', () => {
      if (barAdd.value) addBarField(barAdd.value).focus();
    });
    barClear.addEventListener('click', () => {
      for (const name of [...barFields.keys()]) removeBarField(name);
      for (const name of [...values.keys()]) setValue(name, '');
    });

    // ---------- selection tray ----------
    // Commands picked from anywhere on the page, in the order they were
    // added, so a debug sequence can be assembled across several sheets.
    // Stored as written in the sheet (placeholders intact); values are
    // substituted when the tray is drawn or copied.
    const picked: string[] = [];
    /** Every add-button for a command, so Clear can reset them all. */
    const addButtons = new Map<string, HTMLButtonElement[]>();

    const tray = el('div', 'ref-tray');
    const trayCount = el('span', 'ref-tray-count', '');
    const trayList = el('pre', 'output ref-tray-list', '');
    const trayToggle = el('button', 'btn', 'Show');
    const trayCopy = copyButton('Copy selected', () => fillPlaceholders(picked.join('\n'), values));
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
      trayList.replaceChildren(...partNodes(fillParts(picked.join('\n'), shownValues)));
      if (!any && trayOpen) {
        trayOpen = false;
        trayToggle.textContent = 'Show';
        setShown(trayList, false);
      }
      // Reflect membership on every button for that command.
      for (const [cmd, buttons] of addButtons) {
        const on = picked.includes(cmd);
        for (const b of buttons) {
          b.textContent = on ? '\u2713' : '+';
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
    /** One heading per topic, shown while any of its sheets is. */
    const groupHeads: { topic: string; head: HTMLElement; count: HTMLElement }[] = [];

    for (const { topic: groupTopic, sections } of groupByTopic(referenceSections)) {
      const groupHead = el('h3', 'ref-group');
      const groupCount = el('span', 'ref-group-count', '');
      groupHead.append(document.createTextNode(topicLabel(groupTopic)), groupCount);
      container.append(groupHead);
      groupHeads.push({ topic: groupTopic, head: groupHead, count: groupCount });

      for (const section of sections) {
        const panel = el('details', 'panel ref-section');
        panel.id = `ref-${section.id}`;

        const head = el('summary', 'ref-summary-head');
        const heading = el('div', 'ref-heading');
        heading.append(view('span', 'ref-title', section.title));
        const count = sectionItemCount(section);
        heading.append(
          // The topic is the group heading above, so the tag carries the kind.
          // A copyAll sheet is a sequence run in order, so its rows are steps.
          el(
            'span',
            'ref-tag',
            `${kindLabel(section.kind)} \u00b7 ${count} ${section.copyAll ? 'step' : 'item'}${
              count === 1 ? '' : 's'
            }`,
          ),
        );
        head.append(heading);

        if (section.copyAll && section.entries) {
          const block = section.entries
            .map((e) => e.command)
            .filter((c): c is string => c !== undefined)
            .join('\n');
          head.append(copyButton('Copy all', () => fillPlaceholders(block, values)));
        }
        const link = copyButton(
          'Link',
          () => `${location.origin}${location.pathname}${location.search}#/reference/${section.id}`,
        );
        link.title = 'Copy a link that opens this sheet';
        head.append(link);
        panel.append(head);

        const body = el('div', 'ref-body');
        if (section.description) body.append(view('p', 'ref-note', section.description));
        const vars = variableFields(section);
        if (vars) body.append(vars);

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
          if (section.copyAll && entry.command !== undefined) {
            // Numbered from the sheet, not the filter: step 4 stays step 4.
            line.append(el('span', 'ref-step', String(sectionCommands.length + 1)));
          }
          line.append(
            entry.command !== undefined
              ? view('code', undefined, entry.command, true)
              : view('code', undefined, entry.text ?? ''),
          );
          if (entry.description) line.append(view('span', 'desc', entry.description));
          if (entry.command !== undefined) {
            const cmd = entry.command;
            const add = el('button', 'btn ref-add', '+');
            add.title = 'Add to selection';
            add.addEventListener('click', () => toggleCommand(cmd));
            addButtons.set(cmd, [...(addButtons.get(cmd) ?? []), add]);
            line.append(add, copyButton('Copy', () => fillPlaceholders(cmd, values)));
            sectionCommands.push({ cmd, row: line });
          }
          if (entry.expect) {
            line.classList.add('ref-entry-noted');
            const expect = el('div', 'ref-expect');
            expect.append(el('strong', undefined, 'Look for: '), view('span', undefined, entry.expect));
            line.append(expect);
          }
          body.append(line);
          rows.push({ row: line, matches: (q) => entryMatches(entry, q, fillShown) });
        }

        for (const snippet of section.snippets ?? []) {
          const card = el('div', 'ref-snippet');
          const snipHead = el('div', 'ref-snippet-head');
          snipHead.append(view('strong', undefined, snippet.title));
          snipHead.append(copyButton('Copy', () => fillPlaceholders(snippet.body, values)));
          card.append(snipHead);
          if (snippet.description) card.append(view('span', 'desc', snippet.description));
          card.append(view('pre', 'output', snippet.body, true));
          body.append(card);
          rows.push({ row: card, matches: (q) => snippetMatches(snippet, q, fillShown) });
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
    }

    const noMatches = el('p', 'ref-note', 'Nothing matches those filters.');
    container.append(noMatches, tray);

    function applyFilter(): void {
      let visibleSections = 0;
      let visibleItems = 0;

      /** Sheets the kind filter and search leave, per topic, whatever chip is on. */
      const available = new Map<string, number>();
      /** Sheets actually shown, per topic. */
      const shown = new Map<string, number>();

      for (const { section, panel, rows } of rendered) {
        const kindOk = kind === 'all' || section.kind === kind;
        const inScope = (topic === 'all' || section.topic === topic) && kindOk;

        // A query matching the section title keeps all its rows, so a search
        // for "IPsec" shows whole sheets rather than stripping them to nothing.
        const wholeSection = sectionMatches(section, query);
        let visibleRows = 0;
        for (const { row, matches } of rows) {
          const show = wholeSection || matches(query);
          setShown(row, show);
          if (show) visibleRows++;
        }

        if (kindOk && visibleRows > 0) {
          available.set(section.topic, (available.get(section.topic) ?? 0) + 1);
        }

        const show = inScope && visibleRows > 0;
        setShown(panel, show);
        if (show) {
          shown.set(section.topic, (shown.get(section.topic) ?? 0) + 1);
          visibleSections++;
          visibleItems += visibleRows;
          // Searching should reveal what it found; otherwise respect the user.
          panel.open = query !== '' || userOpened.has(section.id);
        }
      }

      for (const { topic: t, head, count } of groupHeads) {
        const n = shown.get(t) ?? 0;
        setShown(head, n > 0);
        count.textContent = `${n} sheet${n === 1 ? '' : 's'}`;
      }
      const total = [...available.values()].reduce((a, b) => a + b, 0);
      for (const { value, label, button } of topicChips) {
        const n = value === 'all' ? total : (available.get(value) ?? 0);
        const on = value === topic;
        button.textContent = `${label} ${n}`;
        button.classList.toggle('primary', on);
        button.classList.toggle('ref-chip-empty', n === 0 && !on);
        button.setAttribute('aria-pressed', String(on));
      }

      setShown(noMatches, visibleSections === 0);
      summary.textContent = visibleSections
        ? `${visibleSections} sheet${visibleSections === 1 ? '' : 's'} \u00b7 ${visibleItems} item${
            visibleItems === 1 ? '' : 's'
          }`
        : '';
      setShown(expandBtn, visibleSections > 0);
      expandBtn.textContent = rendered.some(({ panel }) => !panel.hidden && !panel.open)
        ? 'Expand all'
        : 'Collapse all';
    }

    applyFilter();
    syncBar();
    syncTray();

    if (linked) {
      const target = rendered.find((r) => r.section.id === linked.id)?.panel;
      target?.classList.add('ref-target');
      // After layout, so the scroll lands on the opened sheet.
      requestAnimationFrame(() => target?.scrollIntoView({ block: 'start' }));
    }
  },
};
