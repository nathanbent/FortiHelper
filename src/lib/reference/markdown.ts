import {
  REFERENCE_TOPICS,
  REFERENCE_KINDS,
  type ReferenceEntry,
  type ReferenceKind,
  type ReferenceSection,
  type ReferenceSnippet,
  type ReferenceTopic,
} from './types';

/**
 * Reference sheets are markdown files under content/reference/.
 *
 *     ---
 *     id: ipsec-status
 *     title: IPsec tunnel status
 *     topic: ipsec
 *     kind: diagnostics
 *     copyAll: true          # optional
 *     order: 10              # optional, lower sorts first
 *     ---
 *
 *     Any prose before the first command becomes the section note.
 *
 *     `get vpn ipsec tunnel summary` - One line per tunnel
 *     - `diagnose vpn tunnel list` - Bullets work too
 *
 * Fenced blocks are copied whole as config snippets, titled by the `###`
 * heading above them. Two info strings change that:
 *
 *     ```commands   every line becomes its own copyable row
 *     ```colors     `<id> - <name>` rows, rendered with a swatch
 */

/** A command row: `` `cmd` `` optionally followed by a dash and a description. */
const COMMAND_RE = /^(?:[-*]\s*)?`([^`]+)`(?:\s*[-–—]\s*(.*))?$/;

/** A colour row inside a ```colors block: `12 - Brown`. */
const COLOR_RE = /^(\d+)\s*[-–—]\s*(.+)$/;

const TOPIC_VALUES = new Set<string>(REFERENCE_TOPICS.map((t) => t.value));
const KIND_VALUES = new Set<string>(REFERENCE_KINDS.map((k) => k.value));

export interface ParsedSheet extends ReferenceSection {
  /** Sort key; lower comes first. Defaults to 100. */
  order: number;
}

class SheetError extends Error {}

/** Split the leading `---` front matter from the body. */
function splitFrontMatter(markdown: string): { meta: Record<string, string>; body: string } {
  const lines = markdown.replace(/^﻿/, '').split(/\r\n|[\n\r]/);
  if (lines[0]?.trim() !== '---') {
    throw new SheetError('missing front matter — the file must start with a --- block');
  }
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) throw new SheetError('front matter is never closed with ---');

  const meta: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const at = line.indexOf(':');
    if (at === -1) throw new SheetError(`front matter line is not "key: value": ${line.trim()}`);
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { meta, body: lines.slice(end + 1).join('\n') };
}

function requireMeta(meta: Record<string, string>, key: string): string {
  const value = meta[key];
  if (!value) throw new SheetError(`front matter is missing "${key}"`);
  return value;
}

/** Parse one markdown sheet. Throws with a readable message on bad content. */
export function parseSheet(markdown: string, filename = 'sheet'): ParsedSheet {
  let meta: Record<string, string>;
  let body: string;
  try {
    ({ meta, body } = splitFrontMatter(markdown));
  } catch (error) {
    throw new SheetError(`${filename}: ${(error as Error).message}`);
  }

  const fail = (message: string): never => {
    throw new SheetError(`${filename}: ${message}`);
  };

  const id = requireMeta(meta, 'id');
  const title = requireMeta(meta, 'title');
  const topic = requireMeta(meta, 'topic');
  const kind = requireMeta(meta, 'kind');
  if (!TOPIC_VALUES.has(topic)) fail(`unknown topic "${topic}"`);
  if (!KIND_VALUES.has(kind)) fail(`unknown kind "${kind}"`);

  const entries: ReferenceEntry[] = [];
  const snippets: ReferenceSnippet[] = [];
  const intro: string[] = [];
  /** The most recent `###` heading, used to title the next fenced block. */
  let lastHeading = '';
  let sawContent = false;

  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      const info = trimmed.slice(3).trim().toLowerCase();
      const block: string[] = [];
      let closed = false;
      for (i++; i < lines.length; i++) {
        if (lines[i].trim().startsWith('```')) {
          closed = true;
          break;
        }
        block.push(lines[i]);
      }
      if (!closed) fail('a fenced block is never closed');

      if (info === 'commands') {
        for (const cmd of block.map((l) => l.trim()).filter(Boolean)) {
          entries.push({ command: cmd });
        }
      } else if (info === 'colors') {
        for (const row of block.map((l) => l.trim()).filter(Boolean)) {
          const match = COLOR_RE.exec(row);
          if (!match) fail(`colors row is not "<id> - <name>": ${row}`);
          entries.push({
            text: match![1],
            description: match![2].trim(),
            swatch: Number(match![1]),
          });
        }
      } else {
        const text = block.join('\n').replace(/^\n+|\n+$/g, '');
        if (!text) fail('a fenced config block is empty');
        snippets.push({ title: lastHeading || title, body: text });
      }
      sawContent = true;
      lastHeading = '';
      continue;
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      lastHeading = trimmed.replace(/^#{1,6}\s+/, '').trim();
      continue;
    }

    const command = COMMAND_RE.exec(trimmed);
    if (command) {
      entries.push({
        command: command[1].trim(),
        ...(command[2]?.trim() ? { description: command[2].trim() } : {}),
      });
      sawContent = true;
      continue;
    }

    // Prose before any command or block becomes the section note.
    if (trimmed && !sawContent) intro.push(trimmed);
  }

  if (entries.length === 0 && snippets.length === 0) {
    fail('no commands, fenced blocks, or colour rows found');
  }

  const order = meta.order === undefined ? 100 : Number(meta.order);
  if (!Number.isFinite(order)) fail(`order "${meta.order}" is not a number`);

  return {
    id,
    title,
    topic: topic as ReferenceTopic,
    kind: kind as ReferenceKind,
    ...(meta.description || intro.length
      ? { description: meta.description || intro.join(' ') }
      : {}),
    ...(entries.length ? { entries } : {}),
    ...(snippets.length ? { snippets } : {}),
    ...(meta.copyAll === 'true' ? { copyAll: true } : {}),
    order,
  };
}

/**
 * Every sheet under content/reference/, sorted by `order` then title.
 *
 * Eager and raw so the markdown is inlined at build time — the deployed app
 * makes no requests for its own content.
 */
export function loadSheets(): ParsedSheet[] {
  const files = import.meta.glob('../../../content/reference/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  const sheets = Object.entries(files).map(([path, markdown]) =>
    parseSheet(markdown, path.split('/').pop() ?? path),
  );

  return sheets.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}
