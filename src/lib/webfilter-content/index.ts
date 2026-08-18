import type { Warning } from '../../types';

/** `set pattern-type` values for a web content filter entry. */
export type ContentPatternType = 'wildcard' | 'regexp';

/** `set action` values for a web content filter entry. */
export type ContentAction = 'block' | 'exempt';

/** `set lang` values for a web content filter entry. */
export type ContentLang =
  | 'western'
  | 'simch'
  | 'trach'
  | 'japanese'
  | 'korean'
  | 'french'
  | 'thai'
  | 'spanish'
  | 'cyrillic';

export const CONTENT_LANGS: { value: ContentLang; label: string }[] = [
  { value: 'western', label: 'western' },
  { value: 'simch', label: 'simch (simplified Chinese)' },
  { value: 'trach', label: 'trach (traditional Chinese)' },
  { value: 'japanese', label: 'japanese' },
  { value: 'korean', label: 'korean' },
  { value: 'french', label: 'french' },
  { value: 'thai', label: 'thai' },
  { value: 'spanish', label: 'spanish' },
  { value: 'cyrillic', label: 'cyrillic' },
];

/**
 * Shape of the generated config.
 *
 * - `entries` — `edit "<pattern>"` bodies to paste inside an existing
 *               `config entries` block.
 * - `full`    — a complete `config webfilter content` list.
 */
export type ContentFormat = 'entries' | 'full';

/** Wildcard patterns are documented as up to 80 characters. */
export const MAX_WILDCARD_PATTERN = 80;

export interface WebContentOptions {
  /** `set pattern-type …`. Default 'wildcard'. */
  patternType?: ContentPatternType;
  /** `set action …`. Default 'block'. */
  action?: ContentAction;
  /** `set status …`, or 'omit' for no status line. Default 'enable'. */
  status?: 'enable' | 'disable' | 'omit';
  /** `set lang …`. Default 'western'. */
  lang?: ContentLang;
  /** `set score …` applied to every pattern. Default 10. */
  score?: number;

  /** Case-insensitive dedupe, keeping first occurrence. Default true. */
  dedupe?: boolean;
  /** Case-insensitive sort. Default true. */
  sort?: boolean;

  /** Output shape. Default 'full'. */
  format?: ContentFormat;
  /** `edit <id>` of the content list, `full` format only. Default 1. */
  listId?: number;
  /** `set name …` of the content list, `full` format only. Default 'webfilter'. */
  listName?: string;
  /** `set comment …` of the content list, `full` format only. Omitted when empty. */
  comment?: string;

  /**
   * Append a `config webfilter profile` block binding the list via
   * `set bword-table <listId>` and `set bword-threshold`. `full` format only.
   * Default false.
   */
  bindProfile?: boolean;
  /** Web filter profile edited by the binding block. Default 'webfilter'. */
  profileName?: string;
  /**
   * `set bword-threshold …` in the binding block. A page is blocked once the
   * summed score of its matching patterns reaches this. Default 10.
   */
  threshold?: number;
}

export interface WebContentResult {
  output: string;
  warnings: Warning[];
  stats: {
    /** Number of patterns emitted. */
    patterns: number;
    /** Number of patterns skipped by dedupe. */
    duplicatesRemoved: number;
    /**
     * How many patterns must match one page to reach the threshold, given the
     * per-pattern score. 0 when the score is 0 (the threshold is unreachable).
     */
    patternsToBlock: number;
  };
}

/** Escape embedded double quotes for the FortiOS CLI. */
function q(value: string): string {
  return value.replace(/"/g, '\\"');
}

function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split(/\r\n|[\n\r]/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Turn a banned-word list into FortiOS web content filter entries.
 *
 * Unlike the URL filter generator, surrounding double quotes are preserved
 * rather than stripped: per the admin guide a quoted phrase is only counted
 * when it appears exactly as written, so the quotes are part of the pattern.
 */
export function generateWebContent(
  input: string,
  options: WebContentOptions = {},
): WebContentResult {
  const patternType = options.patternType ?? 'wildcard';
  const action = options.action ?? 'block';
  const status = options.status ?? 'enable';
  const lang = options.lang ?? 'western';
  const score = options.score ?? 10;
  const dedupe = options.dedupe ?? true;
  const sort = options.sort ?? true;
  const format = options.format ?? 'full';
  const listId = options.listId ?? 1;
  const listName = options.listName ?? 'webfilter';
  const comment = options.comment ?? '';
  const bindProfile = options.bindProfile ?? false;
  const profileName = options.profileName ?? 'webfilter';
  const threshold = options.threshold ?? 10;

  const warnings: Warning[] = [];
  const seen = new Set<string>();
  const patterns: string[] = [];
  let duplicatesRemoved = 0;

  const lines = splitLines(input);
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim();
    if (!s || s.startsWith('#')) continue;

    if (patternType === 'wildcard' && s.length > MAX_WILDCARD_PATTERN) {
      warnings.push({
        line: i + 1,
        message: `pattern is ${s.length} characters; wildcard patterns are documented as up to ${MAX_WILDCARD_PATTERN}`,
      });
    }
    // A phrase is only matched exactly when it is fully quoted, so a stray
    // leading or trailing quote is almost always a typo.
    const quoteCount = (s.match(/"/g) ?? []).length;
    if (quoteCount % 2 !== 0) {
      warnings.push({
        line: i + 1,
        message: `"${s}" has an unbalanced quote — quote a whole phrase to match it exactly`,
      });
    }

    const key = s.toLowerCase();
    if (dedupe && seen.has(key)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(key);
    patterns.push(s);
  }

  if (sort) {
    patterns.sort((a, b) => {
      const ka = a.toLowerCase();
      const kb = b.toLowerCase();
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }

  if (!Number.isInteger(score) || score < 0) {
    warnings.push({ message: `score ${score} is not a non-negative whole number` });
  }
  if (bindProfile && (!Number.isInteger(threshold) || threshold < 0)) {
    warnings.push({ message: `threshold ${threshold} is not a non-negative whole number` });
  }
  if (score === 0) {
    warnings.push({
      message: 'a score of 0 never reaches the threshold, so these patterns cannot block a page',
    });
  }

  const output = patterns.length
    ? emit(patterns, {
        patternType,
        action,
        status,
        lang,
        score,
        format,
        listId,
        listName,
        comment,
        bindProfile,
        profileName,
        threshold,
      }) + '\n'
    : '';

  return {
    output,
    warnings,
    stats: {
      patterns: patterns.length,
      duplicatesRemoved,
      patternsToBlock: score > 0 ? Math.ceil(threshold / score) : 0,
    },
  };
}

interface EmitOptions {
  patternType: ContentPatternType;
  action: ContentAction;
  status: 'enable' | 'disable' | 'omit';
  lang: ContentLang;
  score: number;
  format: ContentFormat;
  listId: number;
  listName: string;
  comment: string;
  bindProfile: boolean;
  profileName: string;
  threshold: number;
}

/** Render the entry list. Returns joined lines with no trailing newline. */
function emit(patterns: string[], o: EmitOptions): string {
  // Field order follows the admin guide's example.
  const entry: string[] = [];
  for (const pattern of patterns) {
    entry.push(`edit "${q(pattern)}"`);
    entry.push(`set pattern-type ${o.patternType}`);
    if (o.status !== 'omit') entry.push(`set status ${o.status}`);
    entry.push(`set lang ${o.lang}`);
    entry.push(`set score ${o.score}`);
    entry.push(`set action ${o.action}`);
    entry.push('next');
  }

  if (o.format === 'entries') return entry.join('\n');

  const lines: string[] = [];
  lines.push('config webfilter content');
  lines.push(indent(1, `edit ${o.listId}`));
  lines.push(indent(2, `set name "${q(o.listName)}"`));
  if (o.comment) lines.push(indent(2, `set comment "${q(o.comment)}"`));
  lines.push(indent(2, 'config entries'));
  for (const line of entry) {
    const isEntryKey = line.startsWith('edit ') || line === 'next';
    lines.push(indent(isEntryKey ? 3 : 4, line));
  }
  lines.push(indent(2, 'end'));
  lines.push(indent(1, 'next'));
  lines.push('end');

  // Binding the table to a profile is what puts it in the traffic path.
  if (o.bindProfile) {
    lines.push('');
    lines.push('config webfilter profile');
    lines.push(indent(1, `edit "${q(o.profileName)}"`));
    lines.push(indent(2, 'config web'));
    lines.push(indent(3, `set bword-threshold ${o.threshold}`));
    lines.push(indent(3, `set bword-table ${o.listId}`));
    lines.push(indent(2, 'end'));
    lines.push(indent(1, 'next'));
    lines.push('end');
  }

  return lines.join('\n');
}

function indent(level: number, line: string): string {
  return '    '.repeat(level) + line;
}
