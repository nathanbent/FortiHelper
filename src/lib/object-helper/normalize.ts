import type { InputRecord, WarnSink } from './parse';
import { iterRecords, loadMeaningfulLines, validateFqdn } from './parse';
import { tryParseIpNetwork, tryParseIpRange } from './ipv4';
import { detectSpreadsheetMapping, parseSpreadsheet, spreadsheetRecords } from './spreadsheet';
import type { ObjectHelperOptions } from './types';
import { MAX_OBJ_NAME_LEN, withDefaults } from './types';

/**
 * Input normalization for the Object Helper: opt-in fixes for the input
 * problems that otherwise end as warnings (URLs pasted where a host was
 * expected, name and address entered the wrong way round, names over the
 * FortiGate length limit, the same name used for two addresses), plus a
 * detector that recommends a different input mode when the text plainly
 * has another shape.
 *
 * Each fix that is off still counts the rows it would have fixed, so the
 * UI can recommend turning it on.
 */

/** Rows/objects each normalization fix would change — counted while it is off. */
export interface NormalizeIssues {
  /** Values that are URLs, host:port, defanged, or carry a trailing dot. */
  urlLike: number;
  /** Named rows whose name is the address and whose value is not. */
  swapped: number;
  /** Object names over the FortiGate limit. */
  longNames: number;
  /** One name used for two different addresses. */
  nameConflicts: number;
}

export function emptyIssues(): NormalizeIssues {
  return { urlLike: 0, swapped: 0, longNames: 0, nameConflicts: 0 };
}

/** Does the value parse as something the generator accepts as an address? */
export function isAddressLike(value: string, opts: { lowercaseFqdn: boolean }): boolean {
  if (tryParseIpNetwork(value) !== null || tryParseIpRange(value) !== null) return true;
  try {
    validateFqdn(value, opts);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reduce a pasted URL-ish value to the bare host: refang `[.]` / `hxxp`,
 * drop the scheme, credentials, path, query, port, surrounding quotes or
 * angle brackets, and trailing dots. IPs, CIDRs, and ranges pass through
 * untouched (a CIDR's `/24` is not a path).
 */
export function cleanAddress(value: string): string {
  let v = value.trim();
  if (!v || tryParseIpNetwork(v) !== null || tryParseIpRange(v) !== null) return v;
  v = v.replace(/^["'<\s]+|["'>\s]+$/g, '');
  v = v
    .replace(/\[\.\]|\(\.\)|\{\.\}|\[dot\]/gi, '.')
    .replace(/\[:\]/g, ':')
    .replace(/^hxxp/i, 'http');
  v = v.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//, '');
  const cut = v.search(/[/?\\]/);
  if (cut !== -1) v = v.slice(0, cut);
  const at = v.lastIndexOf('@');
  if (at !== -1) v = v.slice(at + 1);
  v = v.replace(/:\d+$/, '').replace(/\.+$/, '');
  return v || value.trim();
}

/** Address-like either as entered or once cleaned up. */
function looseAddress(value: string, opts: { lowercaseFqdn: boolean }): boolean {
  return isAddressLike(value, opts) || isAddressLike(cleanAddress(value), opts);
}

/**
 * Apply the record-level fixes (swap reversed name/address, clean up
 * URL-like values). Each change is reported as a `fix` note; with a fix
 * off, the rows it would change are counted in `issues` instead.
 */
export function normalizeRecords(
  records: InputRecord[],
  options: Partial<ObjectHelperOptions>,
  warn: WarnSink,
  issues: NormalizeIssues = emptyIssues(),
): InputRecord[] {
  const opts = withDefaults(options);
  return records.map((record) => {
    let { name, value } = record;

    if (name !== null && name.trim() && !looseAddress(value, opts) && looseAddress(name, opts)) {
      if (opts.fixSwappedPairs) {
        warn(
          `Swapped name and address: name '${value.trim()}', address '${name.trim()}'`,
          record.lineno,
          'fix',
        );
        [name, value] = [value.trim(), name.trim()];
      } else {
        issues.swapped++;
      }
    }

    // A URL in the name slot (an address list read as pairs) would put
    // "https://" into the object name — reduce it to the host as well.
    if (name !== null && /^[a-z][a-z0-9+.-]*:\/\//i.test(name.trim()) && !isAddressLike(name, opts)) {
      const cleaned = cleanAddress(name);
      if (isAddressLike(cleaned, opts)) {
        if (opts.normalizeAddresses) {
          warn(`Cleaned up name '${name.trim()}' to '${cleaned}'`, record.lineno, 'fix');
          name = cleaned;
        } else {
          issues.urlLike++;
        }
      }
    }

    if (!isAddressLike(value, opts)) {
      const cleaned = cleanAddress(value);
      if (cleaned !== value.trim() && isAddressLike(cleaned, opts)) {
        if (opts.normalizeAddresses) {
          warn(`Cleaned up '${value.trim()}' to '${cleaned}'`, record.lineno, 'fix');
          value = cleaned;
        } else {
          issues.urlLike++;
        }
      }
    }

    return name === record.name && value === record.value ? record : { ...record, name, value };
  });
}

// ---------- name length / uniqueness ----------

const NAME_SEP = /[.\-_ ]/;

/**
 * Fit `head + tail` into `max` characters by trimming `head`, keeping the
 * tail (an IP-object index, a group suffix) intact. Prefers cutting at a
 * `.`, `-`, `_`, or space so a hostname loses whole labels rather than
 * half of one, as long as that costs no more than a few extra characters.
 */
export function fitName(head: string, tail = '', max = MAX_OBJ_NAME_LEN): string {
  if (head.length + tail.length <= max) return head + tail;
  const budget = max - tail.length;
  if (budget <= 0) return (head + tail).slice(0, max);
  let cut = head.slice(0, budget);
  if (!NAME_SEP.test(head[budget] ?? '')) {
    let idx = -1;
    for (let i = cut.length - 1; i >= 0; i--) {
      if (NAME_SEP.test(cut[i])) {
        idx = i;
        break;
      }
    }
    if (idx > 0 && budget - idx <= 16) cut = cut.slice(0, idx);
  }
  cut = cut.replace(/[.\-_ ]+$/, '');
  return (cut || head.slice(0, budget)) + tail;
}

/** `name`, or `name-2`, `name-3`, … (kept within `max`) — the first one not taken. */
export function uniqueName(
  name: string,
  taken: (candidate: string) => boolean,
  max = MAX_OBJ_NAME_LEN,
): string {
  if (!taken(name)) return name;
  for (let i = 2; ; i++) {
    const candidate = fitName(name, `-${i}`, max);
    if (!taken(candidate)) return candidate;
  }
}

// ---------- input-mode recommendation ----------

export type InputMode = 'plain' | 'pairs' | 'delimited' | 'spreadsheet';

/** The input-format settings a recommendation changes. */
export interface InputFormat {
  mode: InputMode;
  /** Delimiter for `delimited` mode. */
  delimiter: string;
  /** Plain / pairs: the line after each entry is its comment. */
  useInputComment: boolean;
}

export interface ModeRecommendation extends InputFormat {
  /** Most rows have the address first, so the swap fix should be on too. */
  swap: boolean;
  /** Fraction (0–1) of the input this format reads as valid entries. */
  coverage: number;
  /** Short explanation for the UI. */
  reason: string;
}

// Tabs are covered by spreadsheet mode, `;` and `#` start inline comments.
const DELIMITER_CANDIDATES = [',', '|', '=', ':'];

interface Evaluation {
  coverage: number;
  swaps: number;
  records: number;
}

function evaluateRecords(
  records: InputRecord[],
  linesPerRecord: number,
  totalLines: number,
  opts: { lowercaseFqdn: boolean },
): Evaluation {
  let good = 0;
  let swaps = 0;
  for (const r of records) {
    if (looseAddress(r.value, opts)) {
      // A name that is itself an IP or a URL means an address list is
      // being read as pairs — that row is misread, not good. (A plain
      // hostname as the name of an IP is a normal naming choice.)
      // Likewise a "comment" that is just another address.
      const misread =
        (r.name !== null && addressShapedName(r.name, opts)) ||
        (r.comment !== null && looseAddress(r.comment, opts));
      if (!misread) good++;
    } else if (r.name !== null && r.name.trim() && looseAddress(r.name, opts)) {
      good++;
      swaps++;
    }
  }
  return {
    coverage: totalLines ? Math.min(1, (good * linesPerRecord) / totalLines) : 0,
    swaps,
    records: records.length,
  };
}

/** An IP, CIDR, range, or URL — never a deliberate object name. */
function addressShapedName(name: string, opts: { lowercaseFqdn: boolean }): boolean {
  const n = name.trim();
  if (tryParseIpNetwork(n) !== null || tryParseIpRange(n) !== null) return true;
  return !isAddressLike(n, opts) && isAddressLike(cleanAddress(n), opts);
}

function evaluateFormat(
  text: string,
  lines: string[],
  format: InputFormat,
  opts: ObjectHelperOptions,
): Evaluation {
  if (format.mode === 'spreadsheet') {
    const table = parseSpreadsheet(text);
    const mapping = detectSpreadsheetMapping(table);
    const dataRows = table.rows.slice(mapping.hasHeader ? 1 : 0).filter((r) => r.some((c) => c));
    if (mapping.valueCol === null) return { coverage: 0, swaps: 0, records: 0 };
    const records = spreadsheetRecords(table, { ...mapping, valueCol: mapping.valueCol }, () => {});
    return evaluateRecords(records, 1, dataRows.length, opts);
  }
  const parseOpts: ObjectHelperOptions = {
    ...opts,
    useExplicitNames: format.mode === 'pairs',
    nameFqdnDelimiter: format.mode === 'delimited' ? format.delimiter : '',
    useInputComment: format.useInputComment,
  };
  const records = iterRecords(lines, parseOpts, () => {});
  let perRecord = 1;
  if (format.mode === 'pairs') perRecord = format.useInputComment ? 3 : 2;
  else if (format.mode === 'plain' && format.useInputComment) perRecord = 2;
  return evaluateRecords(records, perRecord, lines.length, opts);
}

function describe(format: InputFormat, swap: boolean): string {
  switch (format.mode) {
    case 'plain':
      return format.useInputComment
        ? 'Lines alternate address / comment — read the second line as the comment.'
        : 'Each line is a single address — use one entry per line.';
    case 'pairs':
      return swap
        ? 'Lines alternate address / name — read them as pairs with the address first.'
        : 'Lines alternate name / address — read them as name + value pairs.';
    case 'delimited': {
      const d = format.delimiter;
      return swap
        ? `Lines look like address${d}name — split on '${d}' with the address first.`
        : `Lines look like name${d}address — split on '${d}'.`;
    }
    case 'spreadsheet':
      return 'Lines contain tab-separated columns — read them as a spreadsheet paste.';
  }
}

function sameFormat(a: InputFormat, b: InputFormat): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'delimited') return a.delimiter === b.delimiter;
  if (a.mode === 'spreadsheet') return true;
  return a.useInputComment === b.useInputComment;
}

/**
 * Suggest input formats that read the text better than the current one —
 * e.g. "name: address" lines pasted in one-per-line mode, alternating
 * name / address lines, or an address-first layout. Returns the best
 * candidates (ties included, at most two), or [] when the current format
 * already reads the input fine or nothing does clearly better.
 */
export function recommendInputModes(
  text: string,
  current: InputFormat,
  options: Partial<ObjectHelperOptions> = {},
): ModeRecommendation[] {
  const opts = withDefaults(options);
  const lines = loadMeaningfulLines(text);
  if (!lines.length) return [];

  const currentEval = evaluateFormat(text, lines, current, opts);
  if (currentEval.coverage >= 0.999) return [];

  const candidates: InputFormat[] = [
    { mode: 'plain', delimiter: current.delimiter, useInputComment: false },
    { mode: 'plain', delimiter: current.delimiter, useInputComment: true },
    { mode: 'pairs', delimiter: current.delimiter, useInputComment: false },
    { mode: 'pairs', delimiter: current.delimiter, useInputComment: true },
    ...DELIMITER_CANDIDATES.map(
      (delimiter): InputFormat => ({ mode: 'delimited', delimiter, useInputComment: false }),
    ),
  ];
  const tabbed = lines.filter((l) => l.includes('\t')).length;
  if (tabbed * 2 >= lines.length) {
    candidates.unshift({ mode: 'spreadsheet', delimiter: current.delimiter, useInputComment: false });
  }

  const scored = candidates
    .filter((c) => !sameFormat(c, current))
    .map((format) => {
      const e = evaluateFormat(text, lines, format, opts);
      return { format, ...e };
    })
    // A single record that happens to pair up is not evidence of a layout.
    .filter((s) => s.records > 0 && s.coverage >= 0.6)
    .filter((s) => s.coverage >= currentEval.coverage + 0.2);
  if (!scored.length) return [];

  const best = Math.max(...scored.map((s) => s.coverage));
  const top = scored.filter((s) => s.coverage >= best - 0.001);
  // Prefer layouts that need no swapping; keep a swapped one only when it is
  // the alternative reading of the same lines (address / comment vs address / name).
  top.sort((a, b) => Number(a.swaps * 2 > a.records) - Number(b.swaps * 2 > b.records));

  return top.slice(0, 2).map((s) => {
    const swap = s.swaps * 2 > s.records;
    return {
      ...s.format,
      swap,
      coverage: s.coverage,
      reason: describe(s.format, swap),
    };
  });
}
