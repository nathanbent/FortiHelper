import type { Tool } from '../types';
import { el, selectField, setShown } from './components';
import { colorHex } from '../lib/colors';
import {
  referenceSections,
  REFERENCE_TOPICS,
  RUN_ON,
  parseVersion,
  versionApplies,
  versionBadge,
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

// Browser-side conveniences. Sheet ids and a version number only: values
// typed into variable fields are never stored.
const FAVOURITES_KEY = 'fortihelper:reference:favourites';
const RECENT_KEY = 'fortihelper:reference:recent';
const VERSION_KEY = 'fortihelper:reference:fortios';
/** How many recently opened sheets to remember. */
const RECENT_MAX = 6;

/** Read a stored string; storage can be blocked or empty, so never throw. */
function readStored(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStored(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Private mode or blocked storage: the page works, it just forgets.
  }
}

/** Stored sheet ids, dropping any that no longer name a sheet. */
function readIds(key: string): string[] {
  const known = new Set(referenceSections.map((s) => s.id));
  return readStored(key)
    .split(',')
    .filter((id) => known.has(id));
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
    /** Pinned sheets, in the order they were pinned. */
    const favourites = readIds(FAVOURITES_KEY);
    /** Recently opened sheets, newest first. */
    let recent = readIds(RECENT_KEY);
    /** The FortiOS version the reader runs, when they have said. */
    let running = parseVersion(readStored(VERSION_KEY));
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

    // FortiOS version: hides commands and sheets that do not apply to it.
    const versionField = el('div', 'field ref-version');
    versionField.append(el('label', undefined, 'FortiOS version'));
    const versionInput = el('input');
    versionInput.type = 'text';
    versionInput.placeholder = 'Any, or e.g. 7.4.5';
    versionInput.inputMode = 'decimal';
    versionInput.autocomplete = 'off';
    versionInput.value = readStored(VERSION_KEY);
    versionInput.title = 'Hides commands and sheets that do not apply to this release';
    const versionWarn = el('small', 'ref-var-warn', 'Enter a version such as 7.4 or 7.4.5');
    setShown(versionWarn, false);
    versionInput.addEventListener('input', () => {
      const text = versionInput.value.trim();
      running = parseVersion(text);
      const bad = text !== '' && running === null;
      setShown(versionWarn, bad);
      if (bad) versionInput.setAttribute('aria-invalid', 'true');
      else versionInput.removeAttribute('aria-invalid');
      writeStored(VERSION_KEY, running ? text : '');
      applyFilter();
    });
    versionField.append(versionInput, versionWarn);
    // Between Kind and Search, so Search keeps the widest slot.
    row.insertBefore(versionField, searchField);

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
    const keysHint = el('span', 'ref-keys', '/ search \u00b7 \u2191 \u2193 move \u00b7 Enter open or copy');
    // The same content as JSON, for use outside this app (see src/lib/export.ts).
    const jsonLink = el('a', 'ref-json', 'JSON');
    jsonLink.href = `${import.meta.env.BASE_URL}reference.json`;
    jsonLink.title = 'Every sheet as one JSON file, for use in other tools';
    summaryRow.append(summary, keysHint, jsonLink, expandBtn);

    // Recently opened sheets, as shortcuts back to them.
    const recentRow = el('div', 'ref-recent');
    filters.append(chips, row, recentRow, summaryRow);
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
    interface RenderedRow {
      row: HTMLElement;
      matches: (q: string) => boolean;
      /** False when the FortiOS version entered rules this row out. */
      applies: () => boolean;
    }
    const rendered: {
      section: ReferenceSection;
      panel: HTMLDetailsElement;
      head: HTMLElement;
      rows: RenderedRow[];
      tag: HTMLElement;
      /** The tag text without a topic, as shown inside a topic group. */
      kindTag: string;
      star: HTMLButtonElement;
    }[] = [];

    /** Make a row a keyboard stop where Enter presses its Copy button. */
    function copyOnEnter(row: HTMLElement, copy: HTMLButtonElement): void {
      row.tabIndex = 0;
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.target !== row) return;
        event.preventDefault();
        copy.click();
      });
    }
    /**
     * One heading per group, shown while any of its sheets is. The first is
     * Favourites; the rest are the topics. A pinned sheet moves up into
     * Favourites and out of its topic group.
     */
    const FAVOURITES = 'favourites';
    const groupHeads: { key: string; head: HTMLElement; count: HTMLElement }[] = [];
    const list = el('div', 'ref-list');
    container.append(list);

    function groupHeading(key: string, label: string): void {
      const head = el('h3', 'ref-group');
      const count = el('span', 'ref-group-count', '');
      head.append(document.createTextNode(label), count);
      groupHeads.push({ key, head, count });
    }
    groupHeading(FAVOURITES, '\u2605 Favourites');

    const groupOf = (section: ReferenceSection): string =>
      favourites.includes(section.id) ? FAVOURITES : section.topic;

    for (const { topic: groupTopic, sections } of groupByTopic(referenceSections)) {
      groupHeading(groupTopic, topicLabel(groupTopic));

      for (const section of sections) {
        const panel = el('details', 'panel ref-section');
        panel.id = `ref-${section.id}`;

        const head = el('summary', 'ref-summary-head');
        const heading = el('div', 'ref-heading');
        heading.append(view('span', 'ref-title', section.title));
        const count = sectionItemCount(section);
        // The topic is the group heading above, so the tag carries the kind;
        // under Favourites there is no such heading, so it carries both.
        // A copyAll sheet is a sequence run in order, so its rows are steps.
        const kindTag = `${kindLabel(section.kind)} \u00b7 ${count} ${
          section.copyAll ? 'step' : 'item'
        }${count === 1 ? '' : 's'}`;
        const tag = el('span', 'ref-tag', kindTag);
        heading.append(tag);
        if (section.runOn) {
          const device = RUN_ON.find((r) => r.value === section.runOn)!.label;
          const badge = el('span', 'ref-badge', `Run on ${device}`);
          badge.title = `Type these into the ${device} CLI`;
          heading.append(badge);
        }
        const sheetVersions = versionBadge(section);
        if (sheetVersions) heading.append(el('span', 'ref-badge', sheetVersions));
        head.append(heading);

        const star = el('button', 'btn ref-star', '\u2606');
        star.addEventListener('click', (event) => {
          // Lives in the summary, where a click would toggle the section.
          event.preventDefault();
          event.stopPropagation();
          const at = favourites.indexOf(section.id);
          if (at === -1) favourites.push(section.id);
          else favourites.splice(at, 1);
          writeStored(FAVOURITES_KEY, favourites.join(','));
          layout();
          applyFilter();
          star.focus();
        });
        head.append(star);

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

        const rows: RenderedRow[] = [];
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
          const entryVersions = versionBadge(entry);
          if (entryVersions) line.append(el('span', 'ref-badge', entryVersions));
          let copy: HTMLButtonElement | undefined;
          if (entry.command !== undefined) {
            const cmd = entry.command;
            const add = el('button', 'btn ref-add', '+');
            add.title = 'Add to selection';
            add.addEventListener('click', () => toggleCommand(cmd));
            addButtons.set(cmd, [...(addButtons.get(cmd) ?? []), add]);
            copy = copyButton('Copy', () => fillPlaceholders(cmd, values));
            line.append(add, copy);
            sectionCommands.push({ cmd, row: line });
          }
          if (entry.expect) {
            line.classList.add('ref-entry-noted');
            const expect = el('div', 'ref-expect');
            expect.append(el('strong', undefined, 'Look for: '), view('span', undefined, entry.expect));
            line.append(expect);
          }
          body.append(line);
          if (copy) copyOnEnter(line, copy);
          rows.push({
            row: line,
            matches: (q) => entryMatches(entry, q, fillShown),
            applies: () => versionApplies(running, entry),
          });
        }

        for (const snippet of section.snippets ?? []) {
          const card = el('div', 'ref-snippet');
          const snipHead = el('div', 'ref-snippet-head');
          snipHead.append(view('strong', undefined, snippet.title));
          const copy = copyButton('Copy', () => fillPlaceholders(snippet.body, values));
          snipHead.append(copy);
          copyOnEnter(card, copy);
          card.append(snipHead);
          if (snippet.description) card.append(view('span', 'desc', snippet.description));
          card.append(view('pre', 'output', snippet.body, true));
          body.append(card);
          rows.push({
            row: card,
            matches: (q) => snippetMatches(snippet, q, fillShown),
            applies: () => true,
          });
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
          else {
            userOpened.add(section.id);
            noteRecent(section.id);
          }
        });

        rendered.push({ section, panel, head, rows, tag, kindTag, star });
      }
    }

    /** Put headings and sheets in order: Favourites first, then each topic. */
    function layout(): void {
      const ordered: HTMLElement[] = [];
      for (const { key, head } of groupHeads) {
        ordered.push(head);
        const members = rendered.filter((r) => groupOf(r.section) === key);
        if (key === FAVOURITES) {
          members.sort((a, b) => favourites.indexOf(a.section.id) - favourites.indexOf(b.section.id));
        }
        ordered.push(...members.map((r) => r.panel));
      }
      list.replaceChildren(...ordered);

      for (const { section, tag, kindTag, star } of rendered) {
        const pinned = favourites.includes(section.id);
        tag.textContent = pinned ? `${topicLabel(section.topic)} \u00b7 ${kindTag}` : kindTag;
        star.textContent = pinned ? '\u2605' : '\u2606';
        star.classList.toggle('ref-star-on', pinned);
        star.title = pinned ? 'Remove from Favourites' : 'Pin to Favourites at the top';
        star.setAttribute('aria-label', star.title);
        star.setAttribute('aria-pressed', String(pinned));
      }
    }

    // ---------- recently opened ----------
    function noteRecent(id: string): void {
      recent = [id, ...recent.filter((r) => r !== id)].slice(0, RECENT_MAX);
      writeStored(RECENT_KEY, recent.join(','));
      syncRecent();
    }

    function syncRecent(): void {
      setShown(recentRow, recent.length > 0);
      const clear = el('button', 'btn ref-recent-clear', 'Clear');
      clear.title = 'Forget recently opened sheets';
      clear.addEventListener('click', () => {
        recent = [];
        writeStored(RECENT_KEY, '');
        syncRecent();
      });
      recentRow.replaceChildren(
        el('span', 'ref-recent-label', 'Recent'),
        ...recent.map((id) => {
          const section = referenceSections.find((s) => s.id === id)!;
          const chip = el('button', 'btn ref-chip', section.title);
          chip.addEventListener('click', () => openSheet(id));
          return chip;
        }),
        clear,
      );
    }

    /** Open a sheet and bring it into view, lifting any filter that hides it. */
    function openSheet(id: string): void {
      const target = rendered.find((r) => r.section.id === id);
      if (!target) return;
      userOpened.add(id);
      noteRecent(id);
      applyFilter();
      if (target.panel.hidden) {
        topic = 'all';
        kind = 'all';
        query = '';
        search.value = '';
        const kindSelect = row.querySelector('select');
        if (kindSelect) kindSelect.value = 'all';
        for (const v of views) renderView(v);
        applyFilter();
      }
      target.panel.open = true;
      target.panel.scrollIntoView({ block: 'start' });
      target.head.focus({ preventScroll: true });
    }

    const noMatches = el('p', 'ref-note', 'Nothing matches those filters.');
    container.append(noMatches, tray);
    layout();

    // ---------- keyboard ----------
    /** Things the arrow keys step through: sheet headers, and rows of open sheets. */
    function stops(): HTMLElement[] {
      return [...list.querySelectorAll<HTMLElement>('summary, .ref-entry[tabindex], .ref-snippet')].filter(
        (node) => {
          const panel = node.closest('details')!;
          if (panel.hidden || node.hidden) return false;
          return node.tagName === 'SUMMARY' || panel.open;
        },
      );
    }

    function onKey(event: KeyboardEvent): void {
      // The shell replaces the container on navigation: stop listening then.
      if (!container.isConnected) {
        document.removeEventListener('keydown', onKey);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (event.key === '/' && !typing) {
        event.preventDefault();
        search.focus();
        search.select();
        return;
      }
      if (event.key === 'Escape' && target === search) {
        search.value = '';
        search.dispatchEvent(new Event('input'));
        search.blur();
        return;
      }
      // Arrows keep their usual meaning in every field except the search box.
      if (typing && target !== search) return;

      const all = stops();
      const at = all.indexOf(target);
      const onStop = at !== -1;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!onStop && target !== search && target !== document.body) return;
        const next = event.key === 'ArrowDown' ? all[at + 1] : at <= 0 ? search : all[at - 1];
        if (!next) return;
        event.preventDefault();
        next.focus();
        next.scrollIntoView({ block: 'nearest' });
        return;
      }
      if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && target.tagName === 'SUMMARY') {
        const item = rendered.find((r) => r.head === target);
        if (!item) return;
        event.preventDefault();
        const open = event.key === 'ArrowRight';
        item.panel.open = open;
        if (open) {
          userOpened.add(item.section.id);
          noteRecent(item.section.id);
        } else userOpened.delete(item.section.id);
      }
    }
    document.addEventListener('keydown', onKey);

    function applyFilter(): void {
      let visibleSections = 0;
      let visibleItems = 0;

      /** Sheets the kind filter and search leave, per topic, whatever chip is on. */
      const available = new Map<string, number>();
      /** Sheets actually shown, per group (Favourites or a topic). */
      const shown = new Map<string, number>();

      for (const { section, panel, rows } of rendered) {
        const kindOk =
          (kind === 'all' || section.kind === kind) && versionApplies(running, section);
        const inScope = (topic === 'all' || section.topic === topic) && kindOk;

        // A query matching the section title keeps all its rows, so a search
        // for "IPsec" shows whole sheets rather than stripping them to nothing.
        const wholeSection = sectionMatches(section, query);
        let visibleRows = 0;
        for (const { row, matches, applies } of rows) {
          const show = (wholeSection || matches(query)) && applies();
          setShown(row, show);
          if (show) visibleRows++;
        }

        if (kindOk && visibleRows > 0) {
          available.set(section.topic, (available.get(section.topic) ?? 0) + 1);
        }

        const show = inScope && visibleRows > 0;
        setShown(panel, show);
        if (show) {
          shown.set(groupOf(section), (shown.get(groupOf(section)) ?? 0) + 1);
          visibleSections++;
          visibleItems += visibleRows;
          // Searching should reveal what it found; otherwise respect the user.
          panel.open = query !== '' || userOpened.has(section.id);
        }
      }

      for (const { key, head, count } of groupHeads) {
        const n = shown.get(key) ?? 0;
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
    syncRecent();

    if (linked) {
      const target = rendered.find((r) => r.section.id === linked.id)?.panel;
      target?.classList.add('ref-target');
      noteRecent(linked.id);
      // After layout, so the scroll lands on the opened sheet.
      requestAnimationFrame(() => target?.scrollIntoView({ block: 'start' }));
    }
  },
};
