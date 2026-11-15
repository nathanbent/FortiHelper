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
import { parseIPv4 } from '../object-helper/ipv4';
import {
  VARIABLE_TYPES,
  type ReferenceSection,
  type ReferenceVariable,
  type VariableType,
} from './types';

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
  return /key|secret|password|passwd|passphrase|psk/i.test(name);
}

/** One run of text: either literal, or a value that replaced a placeholder. */
export interface FilledPart {
  text: string;
  /** The placeholder this text was substituted for, when it was. */
  placeholder?: string;
  /** True when this run is (part of) a search match. */
  match?: boolean;
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

/**
 * Flag every occurrence of `query` (already lowercased) across `parts`,
 * splitting runs where a match starts or ends. Matching is done on the joined
 * text, so a hit may span a literal run and a filled-in value.
 */
export function markMatches(parts: FilledPart[], query: string): FilledPart[] {
  if (!query) return parts;
  const haystack = parts
    .map((p) => p.text)
    .join('')
    .toLowerCase();

  const ranges: [number, number][] = [];
  for (let at = haystack.indexOf(query); at !== -1; at = haystack.indexOf(query, at + query.length)) {
    ranges.push([at, at + query.length]);
  }
  if (ranges.length === 0) return parts;

  const out: FilledPart[] = [];
  let offset = 0;
  for (const part of parts) {
    const end = offset + part.text.length;
    let cursor = offset;
    for (const [from, to] of ranges) {
      if (to <= cursor || from >= end) continue;
      const start = Math.max(from, cursor);
      const stop = Math.min(to, end);
      if (start > cursor) out.push({ ...part, text: part.text.slice(cursor - offset, start - offset) });
      out.push({ ...part, text: part.text.slice(start - offset, stop - offset), match: true });
      cursor = stop;
    }
    if (cursor < end) out.push({ ...part, text: part.text.slice(cursor - offset) });
    offset = end;
  }
  return out;
}

// ---------- documented variables ----------

/** `- <name> (type) - label - e.g. example`; the type and the example are optional. */
const VARIABLE_LINE_RE =
  /^[-*]\s*(<[A-Za-z][A-Za-z0-9_.-]*>)\s*(?:\(([^)]*)\)\s*)?[-\u2013\u2014]\s*(.+)$/;

const TYPE_VALUES = new Set<string>(VARIABLE_TYPES);

/**
 * Parse one line of a `## Variables` list. Returns null for a line that is
 * not a variable at all, and throws on one that is but names an unknown type.
 */
export function parseVariableLine(line: string): ReferenceVariable | null {
  const match = VARIABLE_LINE_RE.exec(line.trim());
  if (!match) return null;
  const [, name, type, rest] = match;
  if (type !== undefined && !TYPE_VALUES.has(type.trim())) {
    throw new Error(
      `${name} has unknown type "${type.trim()}". Valid: ${VARIABLE_TYPES.join(', ')}`,
    );
  }
  // A trailing "- e.g. value" is the example; the rest is the label.
  const eg = /^(.*?)\s*[-\u2013\u2014]\s*e\.?g\.?[:\s]\s*(.+)$/i.exec(rest);
  const example = eg ? eg[2].trim() : '';
  return {
    name,
    label: (eg ? eg[1] : rest).trim(),
    ...(example ? { example } : {}),
    ...(type !== undefined ? { type: type.trim() as VariableType } : {}),
  };
}

/** Parse a file that is nothing but a variables list (the shared catalogue). */
export function parseVariableCatalog(markdown: string): ReferenceVariable[] {
  const found: ReferenceVariable[] = [];
  for (const line of markdown.split(/\r\n|[\n\r]/)) {
    const variable = parseVariableLine(line);
    if (!variable) continue;
    if (found.some((v) => v.name === variable.name)) {
      throw new Error(`${variable.name} is listed twice`);
    }
    found.push(variable);
  }
  return found;
}

/**
 * What is known about a placeholder: the sheet's own entry, else the shared
 * catalogue's, else a label derived from the name.
 */
export function describeVariable(
  name: string,
  shared: ReadonlyMap<string, ReferenceVariable>,
  section?: ReferenceSection,
): ReferenceVariable {
  return (
    section?.variables?.find((v) => v.name === name) ??
    shared.get(name) ?? { name, label: placeholderLabel(name) }
  );
}

const IPV6_RE = /^(?=.*:.*:)[0-9a-f:]+(?:\d+\.\d+\.\d+\.\d+)?$/i;

function isIp(value: string): boolean {
  return parseIPv4(value) !== null || IPV6_RE.test(value);
}

function isWholeNumber(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value)) return false;
  const n = Number(value);
  return n >= min && n <= max;
}

/**
 * A light sanity check on a typed value. Returns a short message when the
 * value plainly is not the right shape, or null when it is fine or blank.
 * Advisory only: the value is used either way.
 */
export function checkVariableValue(type: VariableType | undefined, raw: string): string | null {
  const value = raw.trim();
  if (!type || !value) return null;
  switch (type) {
    case 'ip':
      return isIp(value) ? null : 'Expected an IP address';
    case 'cidr': {
      const slash = value.indexOf('/');
      const address = slash === -1 ? '' : value.slice(0, slash);
      const v4 = parseIPv4(address) !== null;
      const ok =
        slash !== -1 && isIp(address) && isWholeNumber(value.slice(slash + 1), 0, v4 ? 32 : 128);
      return ok ? null : 'Expected a subnet such as 10.1.2.0/24';
    }
    case 'mask': {
      const mask = parseIPv4(value);
      // A netmask is ones then zeros: inverted and incremented, a power of two.
      const inverted = mask === null ? 1 : ~mask >>> 0;
      return mask !== null && (inverted & (inverted + 1)) === 0
        ? null
        : 'Expected a netmask such as 255.255.255.0';
    }
    case 'port':
      return isWholeNumber(value, 1, 65535) ? null : 'Expected a port number, 1 to 65535';
    case 'number':
      return isWholeNumber(value, 0, Number.MAX_SAFE_INTEGER) ? null : 'Expected a whole number';
  }
}
