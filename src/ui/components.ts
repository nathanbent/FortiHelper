import type { Warning } from '../types';

/** Create an element with a class and optional text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Show or hide a control. Used for fields that only apply while their
 * toggle is on, so the panel does not carry inert inputs.
 */
export function setShown(node: HTMLElement, shown: boolean): void {
  node.hidden = !shown;
}

/** Labeled checkbox row. */
export function checkbox(
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void,
  hint?: string,
): HTMLLabelElement {
  const wrap = el('label', 'check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input, document.createTextNode(label));
  if (hint) wrap.append(el('span', 'hint', hint));
  return wrap;
}

/** Labeled text input field. */
export function textField(
  label: string,
  value: string,
  onInput: (v: string) => void,
  placeholder = '',
): HTMLDivElement {
  const wrap = el('div', 'field');
  const lab = el('label', undefined, label);
  const input = el('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(lab, input);
  return wrap;
}

/** Labeled number input field. */
export function numberField(
  label: string,
  value: number,
  onInput: (v: number) => void,
  opts: { min?: number; max?: number; step?: number } = {},
): HTMLDivElement {
  const wrap = el('div', 'field');
  const lab = el('label', undefined, label);
  const input = el('input');
  input.type = 'number';
  input.value = String(value);
  if (opts.min !== undefined) input.min = String(opts.min);
  if (opts.max !== undefined) input.max = String(opts.max);
  if (opts.step !== undefined) input.step = String(opts.step);
  input.addEventListener('input', () => {
    const n = Number(input.value);
    if (!Number.isNaN(n)) onInput(n);
  });
  wrap.append(lab, input);
  return wrap;
}

/** Labeled select field, with an optional hint line underneath. */
export function selectField(
  label: string,
  options: { value: string; label: string }[],
  value: string,
  onChange: (v: string) => void,
  hint?: string,
): HTMLDivElement {
  const wrap = el('div', 'field');
  const lab = el('label', undefined, label);
  const select = el('select');
  for (const opt of options) {
    const o = el('option', undefined, opt.label);
    o.value = opt.value;
    select.append(o);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  wrap.append(lab, select);
  if (hint) wrap.append(el('span', 'hint', hint));
  return wrap;
}

/** Labeled group of checkboxes over a fixed option set. */
export function checkboxGroup(
  label: string,
  options: { value: string; label: string; hint?: string }[],
  selected: string[],
  onChange: (values: string[]) => void,
): HTMLDivElement {
  const wrap = el('div', 'field');
  wrap.append(el('label', undefined, label));
  const group = el('div', 'check-group');
  const current = new Set(selected);
  for (const opt of options) {
    group.append(
      checkbox(
        opt.label,
        current.has(opt.value),
        (checked) => {
          if (checked) current.add(opt.value);
          else current.delete(opt.value);
          // Report in the caller's option order, not click order.
          onChange(options.map((o) => o.value).filter((v) => current.has(v)));
        },
        opt.hint,
      ),
    );
  }
  wrap.append(group);
  return wrap;
}

export interface OutputPane {
  root: HTMLElement;
  /**
   * Replace the output text, stats line, and warnings list.
   *
   * `isEmpty` swaps the output box for a "waiting for input" note and
   * disables Copy / Download. It defaults to "the output is blank", which
   * callers that emit an empty scaffold should override.
   */
  update(output: string, statsLine: string, warnings: Warning[], isEmpty?: boolean): void;
}

/**
 * Output panel with Copy / Download buttons, a stats line, and a warnings box.
 */
export function outputPane(downloadName: string): OutputPane {
  const root = el('section', 'panel');
  root.append(el('h2', undefined, 'Generated config'));

  const btnRow = el('div', 'btn-row');
  const copyBtn = el('button', 'btn', 'Copy');
  const downloadBtn = el('button', 'btn', 'Download');
  const copiedNote = el('span', 'copied', '');
  btnRow.append(copyBtn, downloadBtn, copiedNote);

  const pre = el('pre', 'output', '');
  // Shown in place of an empty output box, so a fresh tab reads as waiting
  // for input rather than as a broken generator.
  const empty = el('div', 'output-empty', 'Paste a list on the left to generate config.');
  const stats = el('div', 'stats', '');
  const warnBox = el('div', 'warnings');
  warnBox.style.display = 'none';

  const outputWrap = el('div', 'output-wrap');
  outputWrap.append(pre, empty);
  root.append(btnRow, outputWrap, stats, warnBox);

  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(pre.textContent ?? '');
    copiedNote.textContent = 'Copied ✓';
    setTimeout(() => (copiedNote.textContent = ''), 1500);
  });

  downloadBtn.addEventListener('click', () => {
    const blob = new Blob([pre.textContent ?? ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = downloadName;
    a.click();
    URL.revokeObjectURL(url);
  });

  return {
    root,
    update(output, statsLine, warnings, isEmpty = output.trim() === '') {
      pre.textContent = output;
      // Some tools emit a scaffold (`config … / end`) even with nothing to
      // put in it, so callers can override what counts as empty.
      setShown(pre, !isEmpty);
      setShown(empty, isEmpty);
      copyBtn.disabled = isEmpty;
      downloadBtn.disabled = isEmpty;
      // All-zero counts next to "nothing generated yet" is just noise.
      stats.textContent = statsLine;
      setShown(stats, !isEmpty && statsLine !== '');
      if (warnings.length) {
        warnBox.style.display = '';
        warnBox.replaceChildren(el('strong', undefined, `Warnings (${warnings.length})`));
        const ul = el('ul');
        for (const w of warnings) {
          ul.append(el('li', undefined, w.line !== undefined ? `Line ${w.line}: ${w.message}` : w.message));
        }
        warnBox.append(ul);
      } else {
        warnBox.style.display = 'none';
      }
    },
  };
}

/** Input textarea panel with an optional "Load file" button. */
export function inputPane(
  placeholder: string,
  onInput: (text: string) => void,
): { root: HTMLElement; textarea: HTMLTextAreaElement } {
  const root = el('section', 'panel');
  root.append(el('h2', undefined, 'Input'));

  const textarea = el('textarea', 'tool-input');
  textarea.placeholder = placeholder;
  textarea.spellcheck = false;
  textarea.addEventListener('input', () => onInput(textarea.value));

  const btnRow = el('div', 'btn-row');
  const fileBtn = el('button', 'btn', 'Load file…');
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = '.txt,.csv,.list,text/plain';
  fileInput.style.display = 'none';
  fileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    textarea.value = await f.text();
    onInput(textarea.value);
    fileInput.value = '';
  });
  btnRow.append(fileBtn, fileInput);

  root.append(textarea, btnRow);
  return { root, textarea };
}
