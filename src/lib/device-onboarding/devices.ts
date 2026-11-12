import type { Warning } from '../../types';
import { columnLabel, parseSpreadsheet } from '../object-helper/spreadsheet';
import type { SpreadsheetTable } from '../object-helper/spreadsheet';

/**
 * Reading a device list — serial number, name, comment, FortiCloud key —
 * out of a pasted or loaded table.
 */

export type DeviceKind = 'switch' | 'ap';

/** One row of the list that made it through validation. */
export interface Device {
  /** 1-based row of the input table, header included. */
  row: number;
  /** Upper-cased serial number; the `edit` key on the FortiGate. */
  serial: string;
  kind: DeviceKind;
  name: string;
  comment: string;
  /** Carried for the inventory export; only reaches config when asked for. */
  cloudKey: string;
  /** Per-row group from the sheet, '' when the sheet has none. */
  group: string;
  /** Per-row profile from the sheet, '' when the sheet has none. */
  profile: string;
}

/** Which column feeds each field. Columns are 0-based; null = not in the sheet. */
export interface DeviceColumns {
  hasHeader: boolean;
  serial: number | null;
  name: number | null;
  comment: number | null;
  cloudKey: number | null;
  kind: number | null;
  group: number | null;
  profile: number | null;
}

export type DeviceField = Exclude<keyof DeviceColumns, 'hasHeader'>;

export const DEVICE_FIELDS: { field: DeviceField; label: string }[] = [
  { field: 'serial', label: 'Serial number' },
  { field: 'name', label: 'Name' },
  { field: 'comment', label: 'Comments' },
  { field: 'cloudKey', label: 'FortiCloud key' },
  { field: 'kind', label: 'Type' },
  { field: 'group', label: 'Group' },
  { field: 'profile', label: 'Profile' },
];

// Matched against a header cell once lower-cased with `_`, `-`, `.`, `#`
// and repeated spaces folded away, so "Serial_Number" and "Serial No."
// both read as "serial number" / "serial no".
const HEADERS: Record<DeviceField, RegExp> = {
  serial: /^(serials?|serial (numbers?|nos?|nums?)|s\/?n|device ids?|switch ids?|wtp ids?)$/,
  name: /^(names?|(device|host|switch|ap) ?names?|labels?)$/,
  comment: /^(comments?|descriptions?|desc|notes?|remarks?|locations?)$/,
  cloudKey: /^((forti ?)?cloud( ?keys?)?|(forti ?cloud|cloud|fc|registration|reg) ?(keys?|codes?)|keys?)$/,
  kind: /^(types?|kinds?|device ?types?|products?)$/,
  group: /^((switch|ap|wtp|device) ?)?groups?$/,
  profile: /^((ap|wtp|forti ?ap) ?)?profiles?$/,
};

function headerKey(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/[_\-.#:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A Fortinet serial: 16 letters and digits, starting with a letter. */
const SERIAL_SHAPE = /^[A-Z][A-Z0-9]{15}$/;

/** Upper-case a serial cell and drop the spaces a label scan can add. */
export function cleanSerial(cell: string): string {
  return cell.replace(/\s+/g, '').toUpperCase();
}

/**
 * Device family from the serial's product code. FortiAP serials start `FP`
 * (FP231F…), FortiAP-U `PU`, FortiAP-S `PS`, FortiAP-C `FAP`/`PC`;
 * FortiSwitch serials start `S` (S248EP…, SR12DP…) or `FS` (FS1E48…).
 */
export function kindFromSerial(serial: string): DeviceKind | null {
  if (/^(FP|FAP|PU|PS|PC)/.test(serial)) return 'ap';
  if (/^(S|FS)/.test(serial)) return 'switch';
  return null;
}

/**
 * The model part of a FortiAP serial, as the default profile names spell
 * it: FP231F… → 231F, PU431F… → U431F, PS221E… → S221E. Null when the
 * serial is not a recognisable FortiAP one.
 */
export function apModelFromSerial(serial: string): string | null {
  if (serial.length < 6) return null;
  if (serial.startsWith('FP')) return serial.slice(2, 6);
  if (serial.startsWith('PU') || serial.startsWith('PS')) return serial.slice(1, 6);
  return null;
}

function kindFromCell(cell: string): DeviceKind | null {
  const k = headerKey(cell).replace(/ /g, '');
  if (/^(fortiswitch|fsw|switch|sw)/.test(k)) return 'switch';
  if (/^(fortiap|fap|ap|wtp|accesspoint|wap)/.test(k)) return 'ap';
  return null;
}

function serialScore(cell: string): number {
  const s = cleanSerial(cell);
  if (!SERIAL_SHAPE.test(s)) return 0;
  return kindFromSerial(s) ? 2 : 1;
}

/** Tab, comma, or semicolon — whichever the first lines are split by. */
export function detectDelimiter(text: string): '\t' | ',' | ';' {
  const sample = text.split(/\r\n|[\n\r]/).filter((l) => l.trim() !== '').slice(0, 20);
  // A tab never appears inside a serial, a name, or a key, so one tab
  // anywhere means a spreadsheet paste.
  if (sample.some((l) => l.includes('\t'))) return '\t';
  const count = (ch: string): number => {
    let n = 0;
    for (const line of sample) {
      let quoted = false;
      for (const c of line) {
        if (c === '"') quoted = !quoted;
        else if (c === ch && !quoted) n++;
      }
    }
    return n;
  };
  const commas = count(',');
  const semis = count(';');
  if (!commas && !semis) return '\t';
  return semis > commas ? ';' : ',';
}

/** Parse pasted or loaded text as a table, detecting the delimiter unless given. */
export function parseDeviceTable(text: string, delimiter?: string): SpreadsheetTable {
  return parseSpreadsheet(text, delimiter ?? detectDelimiter(text));
}

/**
 * Guess the header row and which column holds what. Header names win.
 * Without a header the serial column is the one whose cells look like
 * serials, and the columns after it are taken in the usual order: name,
 * comments, FortiCloud key.
 */
export function detectDeviceColumns(table: SpreadsheetTable): DeviceColumns {
  const cols: DeviceColumns = {
    hasHeader: false,
    serial: null,
    name: null,
    comment: null,
    cloudKey: null,
    kind: null,
    group: null,
    profile: null,
  };
  const { rows, width } = table;
  if (!rows.length || !width) return cols;

  const first = rows[0];
  const taken = new Set<number>();
  for (const { field } of DEVICE_FIELDS) {
    for (let c = 0; c < width; c++) {
      if (!taken.has(c) && HEADERS[field].test(headerKey(first[c] ?? ''))) {
        cols[field] = c;
        taken.add(c);
        break;
      }
    }
  }
  const headerByKeyword = taken.size > 0;

  const scoreAll: number[] = new Array(width).fill(0);
  const scoreData: number[] = new Array(width).fill(0);
  rows.forEach((r, ri) => {
    for (let c = 0; c < width; c++) {
      const s = serialScore(r[c] ?? '');
      scoreAll[c] += s;
      if (ri > 0) scoreData[c] += s;
    }
  });
  const best = (scores: number[]): number | null => {
    let at: number | null = null;
    for (let c = 0; c < width; c++) {
      if (taken.has(c) && c !== cols.serial) continue;
      if (scores[c] > 0 && (at === null || scores[c] > scores[at])) at = c;
    }
    return at;
  };

  if (headerByKeyword) {
    cols.hasHeader = true;
    // A labelled sheet whose serial column has an unfamiliar heading.
    if (cols.serial === null) cols.serial = best(scoreData);
    return cols;
  }

  let serialCol = best(scoreAll);
  // Unrecognised labels above a column of serials are still a header.
  if (
    serialCol !== null &&
    rows.length > 1 &&
    serialScore(first[serialCol] ?? '') === 0 &&
    scoreData[serialCol] > 0
  ) {
    cols.hasHeader = true;
    serialCol = best(scoreData);
  }
  // Nothing serial-shaped anywhere: take the first column and let the
  // row-level warnings say what is wrong with it.
  cols.serial = serialCol ?? 0;

  const dataRows = cols.hasHeader ? rows.slice(1) : rows;
  const rest: number[] = [];
  for (let c = 0; c < width; c++) {
    if (c !== cols.serial && dataRows.some((r) => (r[c] ?? '') !== '')) rest.push(c);
  }
  // Columns left of the serial are read last, so "Name | Serial" still
  // finds its name while "Serial | Name | Comments | Key" reads in order.
  const ordered = [...rest.filter((c) => c > cols.serial!), ...rest.filter((c) => c < cols.serial!)];
  cols.name = ordered[0] ?? null;
  cols.comment = ordered[1] ?? null;
  cols.cloudKey = ordered[2] ?? null;
  return cols;
}

export interface ReadDevicesOptions {
  /** 'auto' reads the family from the Type column, then the serial. */
  kind: 'auto' | DeviceKind;
}

export interface ReadDevicesResult {
  devices: Device[];
  warnings: Warning[];
  /** Rows dropped: blank serial, unusable serial, unknown family, duplicate. */
  skipped: number;
}

/** Characters FortiOS refuses in a name ("XSS vulnerability characters"), plus the quote. */
const UNSAFE_NAME = /[()<>'#"]/g;

/**
 * Turn table rows into devices. Row numbers in warnings are 1-based rows
 * of the table as loaded, so they match the sheet.
 */
export function readDevices(
  table: SpreadsheetTable,
  columns: DeviceColumns,
  options: ReadDevicesOptions = { kind: 'auto' },
): ReadDevicesResult {
  const devices: Device[] = [];
  const warnings: Warning[] = [];
  let skipped = 0;
  if (columns.serial === null) return { devices, warnings, skipped };

  const cell = (row: string[], col: number | null): string => (col === null ? '' : (row[col] ?? ''));
  const seen = new Map<string, number>();
  const names = new Map<string, number>();

  for (let i = columns.hasHeader ? 1 : 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const line = i + 1;
    if (row.every((c) => c === '')) continue;

    const serial = cleanSerial(cell(row, columns.serial));
    if (!serial) {
      warnings.push({
        line,
        message: `nothing in the serial number column (${columnLabel(columns.serial)}); skipped`,
      });
      skipped++;
      continue;
    }
    if (!/^[A-Z0-9-]+$/.test(serial)) {
      warnings.push({ line, message: `"${serial}" is not a serial number; skipped` });
      skipped++;
      continue;
    }

    const typeCell = cell(row, columns.kind);
    let kind: DeviceKind | null = options.kind === 'auto' ? null : options.kind;
    if (kind === null && typeCell) {
      kind = kindFromCell(typeCell);
      if (kind === null) {
        warnings.push({
          line,
          message: `type "${typeCell}" is neither a switch nor an AP; going by the serial number instead`,
        });
      }
    }
    const fromSerial = kindFromSerial(serial);
    if (kind === null) kind = fromSerial;
    if (kind === null) {
      warnings.push({
        line,
        message: `cannot tell whether ${serial} is a FortiSwitch or a FortiAP; skipped — set Device type, or add a Type column`,
      });
      skipped++;
      continue;
    }
    if (fromSerial !== null && fromSerial !== kind) {
      warnings.push({
        line,
        message: `${serial} looks like a ${fromSerial === 'ap' ? 'FortiAP' : 'FortiSwitch'} serial but is being added as a ${kind === 'ap' ? 'FortiAP' : 'FortiSwitch'}`,
      });
    }

    const firstRow = seen.get(serial);
    if (firstRow !== undefined) {
      warnings.push({ line, message: `${serial} is already on row ${firstRow}; skipped` });
      skipped++;
      continue;
    }
    seen.set(serial, line);

    if (!SERIAL_SHAPE.test(serial)) {
      warnings.push({
        line,
        message: `${serial} is ${serial.length} characters; Fortinet serial numbers are 16 letters and digits — check it`,
      });
    }

    const rawName = cell(row, columns.name);
    const name = rawName.replace(UNSAFE_NAME, '').replace(/\s+/g, ' ').trim();
    if (name !== rawName) {
      warnings.push({
        line,
        kind: 'fix',
        message: `name "${rawName}" → "${name}" (FortiOS refuses ( ) < > ' # " in names)`,
      });
    }
    if (name) {
      const key = `${kind}:${name.toLowerCase()}`;
      const other = names.get(key);
      if (other !== undefined) {
        warnings.push({ line, message: `name "${name}" is also used on row ${other}` });
      } else {
        names.set(key, line);
      }
    }

    devices.push({
      row: line,
      serial,
      kind,
      name,
      comment: cell(row, columns.comment).replace(/\s+/g, ' ').trim(),
      cloudKey: cell(row, columns.cloudKey),
      group: cell(row, columns.group).replace(UNSAFE_NAME, '').trim(),
      profile: cell(row, columns.profile).replace(/"/g, '').trim(),
    });
  }

  return { devices, warnings, skipped };
}

/**
 * A starter CSV: every column the tool reads, with two example rows that
 * show the shape. Only the serial number is required — the rest can be
 * left blank or the column deleted. Type is read from the serial when
 * blank; Group and Profile override the tool's options for that row.
 */
export function templateCsv(): string {
  return (
    [
      'Serial Number,Name,Comments,FortiCloud Key,Type,Group,Profile',
      'S248EPTF00000001,IDF1-SW1,First floor IDF,ABCD-1234,FortiSwitch,,',
      'FP231FTF00000002,AP-Lobby,Lobby ceiling,EFGH-5678,FortiAP,,',
    ].join('\r\n') + '\r\n'
  );
}
