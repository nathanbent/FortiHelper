/**
 * Fill-in variables for reference sheets.
 *
 * Sheets mark the parts you have to supply as `<placeholder>`, the same
 * convention quickstart templates use. Nothing has to be declared: the fields
 * a section offers are whatever placeholders its commands and config blocks
 * contain. Prose (notes, descriptions) is never scanned, so "replace every
 * <placeholder>" in a note does not become a field.
 */

import { PLACEHOLDER_RE } from '../quickstart';
import type { ReferenceSection } from './types';

/** Placeholders in `text`, in first-seen order, without repeats. */
export function placeholdersIn(text: string): string[] {
  return [...new Set(text.match(PLACEHOLDER_RE) ?? [])];
}

/** Every placeholder a section's commands and snippets use, in first-seen order. */
export function sectionPlaceholders(section: ReferenceSection): string[] {
  const texts = [
    ...(section.entries ?? []).map((e) => e.command ?? ''),
    ...(section.snippets ?? []).map((s) => s.body),
  ];
  return placeholdersIn(texts.join('\n'));
}

/** Field label for a placeholder: `<switch-id>` -> `switch id`. */
export function placeholderLabel(name: string): string {
  return name.replace(/^<|>$/g, '').replace(/[-_]/g, ' ');
}

/**
 * True for placeholders that hold a secret (a pre-shared key, a password).
 * The UI masks these and keeps their value off the screen.
 */
export function isSecretPlaceholder(name: string): boolean {
  return /key|secret|password|passwd|psk/i.test(name);
}

/** One run of text: either literal, or a value that replaced a placeholder. */
export interface FilledPart {
  text: string;
  /** The placeholder this text was substituted for, when it was. */
  placeholder?: string;
}

/**
 * Split `text` into literal runs and substituted values. A placeholder with
 * no (or a blank) value stays in place as literal text, so output never
 * silently loses one. Done in a single pass: a value that itself looks like
 * a placeholder is not substituted again.
 */
export function fillParts(text: string, values: ReadonlyMap<string, string>): FilledPart[] {
  const parts: FilledPart[] = [];
  let literal = '';
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    const value = (values.get(match[0]) ?? '').trim();
    if (!value) continue;
    literal += text.slice(last, match.index);
    if (literal) parts.push({ text: literal });
    literal = '';
    parts.push({ text: value, placeholder: match[0] });
    last = match.index + match[0].length;
  }
  literal += text.slice(last);
  if (literal) parts.push({ text: literal });
  return parts;
}

/** `text` with every placeholder that has a value replaced by it. */
export function fillPlaceholders(text: string, values: ReadonlyMap<string, string>): string {
  return fillParts(text, values)
    .map((p) => p.text)
    .join('');
}
