import { el, textField, outputPane, setShown } from './components';
import { parseQuickstart, fillQuickstart, type QuickstartTemplate } from '../lib/quickstart';
import type { Warning } from '../types';

const SAVED_TEMPLATE_KEY = 'fortinate:quickstart:template';

/** The template this browser has saved, if any. */
export function loadSavedTemplate(): string | null {
  try {
    return localStorage.getItem(SAVED_TEMPLATE_KEY);
  } catch {
    return null;
  }
}

function saveTemplate(markdown: string | null): void {
  try {
    if (markdown === null) localStorage.removeItem(SAVED_TEMPLATE_KEY);
    else localStorage.setItem(SAVED_TEMPLATE_KEY, markdown);
  } catch {
    // Storage blocked — the template just will not survive a reload.
  }
}

/**
 * A fill-in-the-blanks panel for a quickstart template.
 *
 * The form is built from the template itself — one field per variable in its
 * `## Variables` list — so supplying a different template repopulates it with
 * no code changes.
 */
export function quickstartPanel(initialMarkdown: string): HTMLElement {
  const root = el('div', 'quickstart');

  let template: QuickstartTemplate = parseQuickstart(initialMarkdown);
  let values: Record<string, string> = {};

  // A template pasted or loaded here is kept in this browser only — the app
  // makes no requests, so it never leaves the machine. That is what lets a
  // private template be used on the public build without committing it. The
  // index lists it as its own card; this panel always renders what it is
  // given, so clicking a bundled template shows that template.

  // ---------- supply a different template ----------
  const source = el('details', 'adv');
  source.append(el('summary', undefined, 'Use a different template'));
  source.append(
    el(
      'p',
      'ref-note',
      'Paste a markdown template with a "## Variables" list and a fenced config block, or load one from a file. The form below rebuilds from it.',
    ),
  );

  const pasteArea = el('textarea', 'tool-input');
  pasteArea.placeholder = '# My Quickstart\n\n## Variables\n- <site-name> - Site name - e.g. TI\n\n```\nconfig system global\n    set hostname "<site-name>"\nend\n```';
  pasteArea.spellcheck = false;

  const savedNote = el('p', 'ref-note', '');
  const sourceRow = el('div', 'btn-row');
  const useBtn = el('button', 'btn primary', 'Use this template');
  const fileBtn = el('button', 'btn', 'Load file…');
  const forgetBtn = el('button', 'btn', 'Forget saved template');
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = '.md,.markdown,.txt,text/plain,text/markdown';
  fileInput.style.display = 'none';

  useBtn.addEventListener('click', () => {
    if (!pasteArea.value.trim()) return;
    saveTemplate(pasteArea.value);
    load(pasteArea.value);
  });
  fileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const text = await file.text();
    pasteArea.value = text;
    saveTemplate(text);
    load(text);
    fileInput.value = '';
  });
  forgetBtn.addEventListener('click', () => {
    pasteArea.value = '';
    saveTemplate(null);
    // The saved card is gone now, so the index is the only sensible landing.
    location.hash = '#/quickstart';
  });

  sourceRow.append(useBtn, fileBtn, forgetBtn, fileInput);
  source.append(pasteArea, sourceRow);
  root.append(savedNote, source);

  // ---------- the generated form ----------
  const heading = el('h3', 'quickstart-title', '');
  const fields = el('div', 'quickstart-fields');

  const actions = el('div', 'btn-row');
  const exampleBtn = el('button', 'btn', 'Fill example values');
  const clearBtn = el('button', 'btn', 'Clear');
  exampleBtn.addEventListener('click', () => {
    for (const v of template.variables) if (v.example) values[v.name] = v.example;
    renderFields();
    regenerate();
  });
  clearBtn.addEventListener('click', () => {
    values = {};
    renderFields();
    regenerate();
  });
  actions.append(exampleBtn, clearBtn);

  const output = outputPane('quickstart.txt');

  root.append(heading, fields, actions, output.root);

  function renderFields(): void {
    const rows: HTMLElement[] = [];
    for (const variable of template.variables) {
      const label = variable.undocumented
        ? `${variable.description} (not in Variables list)`
        : variable.description;
      const field = textField(
        label,
        values[variable.name] ?? '',
        (v) => {
          values[variable.name] = v;
          regenerate();
        },
        variable.example ? `e.g. ${variable.example}` : variable.name,
      );
      // Show the placeholder itself, so a field can be matched to the config.
      field.append(
        el(
          'span',
          'hint',
          `${variable.name} · ${variable.occurrences} use${variable.occurrences === 1 ? '' : 's'}`,
        ),
      );
      rows.push(field);
    }
    fields.replaceChildren(...rows);
    setShown(exampleBtn, template.variables.some((v) => v.example));
  }

  function regenerate(): void {
    const { output: text, missing, replaced } = fillQuickstart(template, values);
    const warnings: Warning[] = [...template.warnings];
    if (missing.length) {
      warnings.push({
        message: `${missing.length} placeholder${
          missing.length === 1 ? '' : 's'
        } still unfilled: ${missing.join(', ')}`,
      });
    }
    const filled = template.variables.filter((v) => (values[v.name] ?? '').trim()).length;
    output.update(
      text,
      `${filled}/${template.variables.length} filled · ${replaced} substitution${
        replaced === 1 ? '' : 's'
      }`,
      warnings,
      false,
    );
  }

  function load(markdown: string): void {
    template = parseQuickstart(markdown);
    values = {};
    heading.textContent = template.title;
    const saved = loadSavedTemplate();
    const usingSaved = saved !== null && markdown === saved;
    savedNote.textContent = usingSaved
      ? 'This template is saved in this browser. It is stored locally and never uploaded.'
      : '';
    setShown(savedNote, usingSaved);
    setShown(forgetBtn, saved !== null);
    renderFields();
    regenerate();
  }

  load(initialMarkdown);
  return root;
}
