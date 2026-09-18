import type { InputRecord, WarnSink } from './parse';
import { stripChars, validateFqdn } from './parse';
import { tryParseIpNetwork, tryParseIpRange } from './ipv4';

/**
 * Spreadsheet-paste input for the Object Helper.
 *
 * Excel, Google Sheets, and LibreOffice all put copied cells on the
 * clipboard as tab-separated text: cells separated by tabs, rows by
 * newlines, and any cell containing a tab, newline, or quote wrapped in
 * double quotes with `""` escaping. Parsing that format lets a column
 * selection be pasted straight into the input box.
 */

/** A parsed paste: trimmed cells, trailing empty rows dropped. */
export interface SpreadsheetTable {
  rows: string[][];
  /** Widest row, in cells. 0 when there are no rows. */
  width: number;
}

/** Which columns feed each record field. Columns are 0-based; null = unused. */
export interface SpreadsheetMapping {
  hasHeader: boolean;
  nameCol: number | null;
  valueCol: number | null;
  commentCol: number | null;
}

/** Spreadsheet-style column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnLabel(index: number): string {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * Parse clipboard TSV as produced by spreadsheet apps. Interior blank rows
 * are kept so row numbers in warnings match the pasted sheet; the trailing
 * blank row Excel's final newline creates is dropped.
 */
export function parseSpreadsheet(text: string): SpreadsheetTable {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let cellStart = true;
  let sawAny = false;

  const endCell = (): void => {
    row.push(cell.trim());
    cell = '';
    cellStart = true;
  };
  const endRow = (): void => {
    endCell();
    rows.push(row);
    row = [];
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    sawAny = true;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cellStart) {
      inQuotes = true;
      cellStart = false;
      i++;
      continue;
    }
    if (ch === '\t') {
      endCell();
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      i++;
      continue;
    }
    cell += ch;
    cellStart = false;
    i++;
  }
  if (sawAny && (cell !== '' || row.length || rows.length === 0)) endRow();

  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();

  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  return { rows, width };
}

// Header keywords, matched against a whole trimmed cell, case-insensitively.
const NAME_HEADER = /^(names?|objects?|object ?names?|host ?names?|labels?|devices?|servers?)$/i;
const VALUE_HEADER =
  /^(address(es)?|ips?|ip ?address(es)?|fqdns?|domains?|hosts?|subnets?|networks?|cidrs?|values?|destinations?|urls?)$/i;
const COMMENT_HEADER = /^(comments?|descriptions?|desc|notes?|remarks?|info)$/i;

/** Does the cell parse as something the generator accepts as a value? */
function isValueLike(cell: string): boolean {
  if (!cell) return false;
  if (tryParseIpNetwork(cell) !== null) return true;
  if (tryParseIpRange(cell) !== null) return true;
  try {
    validateFqdn(cell, { lowercaseFqdn: true });
    return true;
  } catch {
    return false;
  }
}

/** Leftmost column with the highest score, or null when all scores are 0. */
function argmax(scores: number[]): number | null {
  let best: number | null = null;
  for (let c = 0; c < scores.length; c++) {
    if (scores[c] > 0 && (best === null || scores[c] > scores[best])) best = c;
  }
  return best;
}

/**
 * Guess which row is a header and which columns hold the name, the
 * address value, and the comment. Header keywords win; otherwise the
 * column with the most IP/CIDR/range/FQDN-looking cells is the value,
 * a populated column to its left is the name, and one to its right is
 * the comment — the layout of a typical "Name | Address | Notes" sheet.
 */
export function detectSpreadsheetMapping(table: SpreadsheetTable): SpreadsheetMapping {
  const { rows, width } = table;
  const mapping: SpreadsheetMapping = {
    hasHeader: false,
    nameCol: null,
    valueCol: null,
    commentCol: null,
  };
  if (!rows.length || !width) return mapping;

  const first = rows[0];
  const headerByKeyword = first.some(
    (c) => NAME_HEADER.test(c) || VALUE_HEADER.test(c) || COMMENT_HEADER.test(c),
  );

  const scoreAll: number[] = new Array(width).fill(0);
  const scoreData: number[] = new Array(width).fill(0);
  rows.forEach((r, ri) => {
    for (let c = 0; c < width; c++) {
      if (isValueLike(r[c] ?? '')) {
        scoreAll[c]++;
        if (ri > 0) scoreData[c]++;
      }
    }
  });

  let hasHeader = headerByKeyword;
  let valueCol =
    hasHeader && rows.length > 1 ? argmax(scoreData) : argmax(scoreAll);

  // No keyword header, but the first row's value cell is the only one that
  // doesn't parse — a header of labels above a column of addresses.
  if (
    !hasHeader &&
    valueCol !== null &&
    rows.length > 1 &&
    !isValueLike(first[valueCol] ?? '') &&
    scoreData[valueCol] > 0
  ) {
    hasHeader = true;
    valueCol = argmax(scoreData);
  }

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const hasData = (c: number): boolean => dataRows.some((r) => (r[c] ?? '') !== '');

  let nameCol: number | null = null;
  let commentCol: number | null = null;

  if (hasHeader) {
    for (let c = 0; c < width; c++) {
      if (c === valueCol) continue;
      if (nameCol === null && NAME_HEADER.test(first[c] ?? '')) nameCol = c;
      if (commentCol === null && COMMENT_HEADER.test(first[c] ?? '')) commentCol = c;
    }
  }
  if (valueCol !== null) {
    if (nameCol === null) {
      for (let c = 0; c < valueCol; c++) {
        if (c !== commentCol && hasData(c)) {
          nameCol = c;
          break;
        }
      }
    }
    if (commentCol === null) {
      for (let c = valueCol + 1; c < width; c++) {
        if (c !== nameCol && hasData(c)) {
          commentCol = c;
          break;
        }
      }
    }
  }

  return { hasHeader, nameCol, valueCol, commentCol };
}

/**
 * Turn table rows into generator records using the given mapping.
 * Line numbers are 1-based rows of the pasted sheet (the header is row 1),
 * so warnings point at the row the user sees. Blank rows are skipped
 * silently; a row whose value cell is empty is skipped with a warning.
 * An empty name cell falls back to naming the object after its value.
 */
export function spreadsheetRecords(
  table: SpreadsheetTable,
  mapping: SpreadsheetMapping & { valueCol: number },
  warn: WarnSink,
): InputRecord[] {
  const records: InputRecord[] = [];
  const start = mapping.hasHeader ? 1 : 0;
  for (let i = start; i < table.rows.length; i++) {
    const row = table.rows[i];
    const lineno = i + 1;
    if (row.every((c) => c === '')) continue;
    const value = row[mapping.valueCol] ?? '';
    if (!value) {
      warn(
        `Row has nothing in the address column (${columnLabel(mapping.valueCol)}); skipping.`,
        lineno,
      );
      continue;
    }
    const rawName = mapping.nameCol !== null ? (row[mapping.nameCol] ?? '') : '';
    const rawComment = mapping.commentCol !== null ? (row[mapping.commentCol] ?? '') : '';
    records.push({
      lineno,
      name: rawName ? stripChars(rawName, '"') : null,
      value,
      comment: rawComment || null,
    });
  }
  return records;
}
