import {
  REFERENCE_TOPICS,
  REFERENCE_KINDS,
  RUN_ON,
  type RunOn,
  type ReferenceEntry,
  type ReferenceKind,
  type ReferenceSection,
  type ReferenceVariable,
  type ReferenceSnippet,
  type ReferenceTopic,
} from './types';
import { parseVariableCatalog, parseVariableLine } from './variables';
import { parseVersion } from './versions';

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
 *     runOn: fortigate       # optional: fortigate | fortiswitch, shown as a badge
 *     since: 6.4             # optional: first FortiOS release the sheet applies to
 *     until: 7.6             # optional: first release it no longer applies to
 *     ---
 *
 *     Any prose before the first command becomes the section note; prose
 *     between a `###` heading and its fenced block describes that block.
 *
 *     `get vpn ipsec tunnel summary` - One line per tunnel
 *     > A line starting with > says what to look for in that command's output
 *     `diagnose sys sdwan service4` - A description may end in a version tag [7.4.4+]
 *     `diagnose sys sdwan service` - [<7.4.4] means "before 7.4.4"
 *     - `diagnose vpn tunnel list` - Bullets work too
 *
 *     ## Variables
 *     - <peer-ip> (ip) - Remote gateway - e.g. 203.0.113.10
 *
 * A `## Variables` list labels the sheet's placeholder fields; the `(type)`
 * and the `e.g.` are optional. Placeholders it leaves out fall back to the
 * shared catalogue in content/reference-variables.md.
 *
 * Fenced blocks are copied whole as config snippets, titled by the `###`
 * heading above them. Two info strings change that:
 *
 *     ```commands   every line becomes its own copyable row
 *     ```colors     `<id> - <name>` rows, rendered with a swatch
 */

/** A command row: `` `cmd` `` optionally followed by a dash and a description. */
const COMMAND_RE = /^(?:[-*]\s*)?`([^`]+)`(?:\s*[-\u2013\u2014]\s*(.*))?$/;

/** A colour row inside a ```colors block: `12 - Brown`. */
const COLOR_RE = /^(\d+)\s*[-\u2013\u2014]\s*(.+)$/;

/** A version tag closing a description: `[7.4+]` (since) or `[<7.4]` (until). */
const VERSION_TAG_RE = /\s*\[(<)?\s*(\d+(?:\.\d+){0,2})(\+)?\]\s*$/;

/** Split a trailing version tag off a command's description. */
function splitVersionTag(description: string): {
  description: string;
  since?: string;
  until?: string;
} {
  const match = VERSION_TAG_RE.exec(description);
  // `[7.4]` with neither `<` nor `+` is ordinary bracketed text, not a tag.
  if (!match || Boolean(match[1]) === Boolean(match[3])) return { description };
  const rest = description.slice(0, match.index).trim();
  return match[1] ? { description: rest, until: match[2] } : { description: rest, since: match[2] };
}

const RUN_ON_VALUES = new Set<string>(RUN_ON.map((r) => r.value));
const TOPIC_VALUES = new Set<string>(REFERENCE_TOPICS.map((t) => t.value));
const KIND_VALUES = new Set<string>(REFERENCE_KINDS.map((k) => k.value));

export interface ParsedSheet extends ReferenceSection {
  /** Sort key; lower comes first. Defaults to 100. */
  order: number;
}

class SheetError extends Error {}

/** Split the leading `---` front matter from the body. */
function splitFrontMatter(markdown: string): { meta: Record<string, string>; body: string } {
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r\n|[\n\r]/);
  if (lines[0]?.trim() !== '---') {
    throw new SheetError('missing front matter: the file must start with a --- block');
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
  if (meta.runOn && !RUN_ON_VALUES.has(meta.runOn)) fail(`unknown runOn "${meta.runOn}"`);
  for (const key of ['since', 'until'] as const) {
    if (meta[key] && !parseVersion(meta[key])) fail(`${key} "${meta[key]}" is not a version`);
  }

  const entries: ReferenceEntry[] = [];
  const snippets: ReferenceSnippet[] = [];
  const variables: ReferenceVariable[] = [];
  /** True while inside the `## Variables` list. */
  let inVariables = false;
  const intro: string[] = [];
  /** The most recent `###` heading, used to title the next fenced block. */
  let lastHeading = '';
  /** Prose under that heading, which describes the fenced block it titles. */
  let headingProse: string[] = [];
  let sawContent = false;

  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inVariables = false;
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
        snippets.push({
          title: lastHeading || title,
          ...(headingProse.length ? { description: headingProse.join(' ') } : {}),
          body: text,
        });
      }
      sawContent = true;
      lastHeading = '';
      headingProse = [];
      continue;
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      const heading = trimmed.replace(/^#{1,6}\s+/, '').trim();
      // "Variables" introduces the field list; it never titles a config block.
      inVariables = /^variables$/i.test(heading);
      lastHeading = inVariables ? '' : heading;
      headingProse = [];
      continue;
    }

    if (inVariables) {
      if (!trimmed) continue;
      let variable: ReferenceVariable | null = null;
      try {
        variable = parseVariableLine(trimmed);
      } catch (error) {
        fail((error as Error).message);
      }
      if (!variable) fail(`Variables line is not "- <name> - label - e.g. example": ${trimmed}`);
      if (variables.some((v) => v.name === variable!.name)) fail(`${variable!.name} is listed twice`);
      variables.push(variable!);
      continue;
    }

    // `> text` under a command: what to look for in its output.
    if (trimmed.startsWith('>')) {
      const note = trimmed.replace(/^>\s*/, '');
      const last = entries[entries.length - 1];
      if (!last || last.command === undefined) fail(`"> ${note}" does not follow a command`);
      if (note) last.expect = last.expect ? `${last.expect} ${note}` : note;
      continue;
    }

    const command = COMMAND_RE.exec(trimmed);
    if (command) {
      const tagged = splitVersionTag(command[2]?.trim() ?? '');
      entries.push({
        command: command[1].trim(),
        ...(tagged.description ? { description: tagged.description } : {}),
        ...(tagged.since ? { since: tagged.since } : {}),
        ...(tagged.until ? { until: tagged.until } : {}),
      });
      sawContent = true;
      continue;
    }

    // Prose between a heading and its fenced block describes that block.
    if (trimmed && lastHeading) {
      headingProse.push(trimmed);
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
    ...(variables.length ? { variables } : {}),
    ...(meta.runOn ? { runOn: meta.runOn as RunOn } : {}),
    ...(meta.since ? { since: meta.since } : {}),
    ...(meta.until ? { until: meta.until } : {}),
    ...(meta.copyAll === 'true' ? { copyAll: true } : {}),
    order,
  };
}

/**
 * Every sheet under content/reference/, sorted by `order` then title.
 *
 * Eager and raw so the markdown is inlined at build time: the deployed app
 * makes no requests for its own content.
 */
export function loadSheets(): ParsedSheet[] {
  const files = import.meta.glob('../../../content/reference/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  return parseSheets(files);
}

/**
 * Parse a set of sheets, keyed by path or filename, into display order:
 * `order` then title. Shared by the app and the JSON export.
 */
export function parseSheets(files: Record<string, string>): ParsedSheet[] {
  return Object.entries(files)
    .map(([path, markdown]) => parseSheet(markdown, path.split('/').pop() ?? path))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/**
 * The shared variable catalogue, content/reference-variables.md: labels,
 * examples and types for placeholders that many sheets use.
 */
export function loadSharedVariables(): Map<string, ReferenceVariable> {
  const files = import.meta.glob('../../../content/reference-variables.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  const shared = new Map<string, ReferenceVariable>();
  for (const [path, markdown] of Object.entries(files)) {
    try {
      for (const variable of parseVariableCatalog(markdown)) shared.set(variable.name, variable);
    } catch (error) {
      throw new SheetError(`${path.split('/').pop()}: ${(error as Error).message}`);
    }
  }
  return shared;
}
