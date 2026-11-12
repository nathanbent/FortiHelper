/**
 * A small read-only .xlsx reader — enough to pull the cell text out of a
 * device list, with no dependency and nothing leaving the page.
 *
 * An .xlsx file is a zip of XML parts. The zip is read from its central
 * directory, parts are inflated with the platform's DecompressionStream,
 * and the handful of elements that carry cell text (`<row>`, `<c>`, `<v>`,
 * `<si>`, `<t>`) are picked out with patterns rather than a DOM parser, so
 * the same code runs in the browser and under the test runner.
 *
 * Not handled: zip64 archives, encrypted workbooks, the legacy binary
 * .xls format, and formatting — a date cell reads as its serial number.
 */

export interface XlsxSheet {
  name: string;
  /** Cell text by row then column; blank rows and cells are kept as ''. */
  rows: string[][];
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** Rows past this are ignored — a stray formatted cell at row 1048576 must not allocate a million rows. */
const MAX_ROWS = 20000;
const MAX_COLS = 200;

interface ZipEntry {
  method: number;
  compressedSize: number;
  localOffset: number;
}

function readCentralDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record sits at the very end, followed only
  // by an optional comment of up to 65535 bytes.
  let eocd = -1;
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not an .xlsx file (no zip directory found)');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || offset === 0xffffffff) {
    throw new Error('this workbook uses the zip64 format, which is not supported — save it as CSV instead');
  }

  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== SIG_CENTRAL) {
      throw new Error('the .xlsx file is damaged (bad zip directory)');
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('this browser cannot unpack .xlsx files — save the sheet as CSV instead');
  }
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readPart(
  bytes: Uint8Array,
  entries: Map<string, ZipEntry>,
  name: string,
): Promise<string | null> {
  const entry = entries.get(name);
  if (!entry) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = entry.localOffset;
  if (at + 30 > bytes.length || view.getUint32(at, true) !== SIG_LOCAL) {
    throw new Error('the .xlsx file is damaged (bad zip entry)');
  }
  // The local header repeats the name and carries its own extra field,
  // whose length can differ from the central directory's.
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  let raw: Uint8Array;
  if (entry.method === 0) raw = data;
  else if (entry.method === 8) raw = await inflateRaw(data);
  else throw new Error(`the .xlsx file uses an unsupported compression method (${entry.method})`);
  return new TextDecoder().decode(raw);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text
    .replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, ref: string) => {
      if (ref[0] === '#') {
        const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[ref] ?? whole;
    })
    // Excel writes control characters it cannot put in XML as _xHHHH_.
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return m ? decodeXml(m[1] ?? m[2] ?? '') : null;
}

/** All `<t>` runs of a string item joined, skipping phonetic (`<rPh>`) text. */
function stringItemText(xml: string): string {
  const body = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of body.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += decodeXml(m[1] ?? '');
  return out;
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const out: string[] = [];
  for (const m of xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) out.push(stringItemText(m[1] ?? ''));
  return out;
}

/** "BC12" → 0-based column 54. Returns -1 when there are no letters. */
function columnIndex(ref: string): number {
  let n = 0;
  let seen = false;
  for (const ch of ref) {
    const code = ch.toUpperCase().charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
    seen = true;
  }
  return seen ? n - 1 : -1;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  let nextRow = 0;
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(rowMatch[1], 'r'));
    const rowIndex = Number.isInteger(r) && r >= 1 ? r - 1 : nextRow;
    nextRow = rowIndex + 1;
    if (rowIndex >= MAX_ROWS) break;

    const cells: string[] = [];
    let nextCol = 0;
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const fromRef = columnIndex(attr(cellMatch[1], 'r') ?? '');
      const col = fromRef >= 0 ? fromRef : nextCol;
      nextCol = col + 1;
      if (col >= MAX_COLS) continue;

      const type = attr(cellMatch[1], 't');
      const body = cellMatch[2] ?? '';
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
      let text: string;
      if (type === 'inlineStr') text = stringItemText(body);
      else if (!v) text = '';
      else if (type === 's') text = shared[Number(v[1])] ?? '';
      else if (type === 'b') text = v[1].trim() === '1' ? 'TRUE' : 'FALSE';
      else text = decodeXml(v[1]);

      text = text.trim();
      if (!text) continue;
      while (cells.length < col) cells.push('');
      cells[col] = text;
    }

    // Keep blank rows so row numbers in warnings match the sheet.
    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = cells;
  }
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return rows;
}

/** Resolve a relationship target against the `xl/` folder. */
function partPath(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts: string[] = ['xl'];
  for (const piece of target.split('/')) {
    if (piece === '..') parts.pop();
    else if (piece && piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}

/**
 * Read every worksheet of an .xlsx workbook as rows of cell text, in
 * workbook tab order. Throws with a readable message when the bytes are
 * not a workbook this reader can open.
 */
export async function readXlsx(bytes: Uint8Array): Promise<XlsxSheet[]> {
  const entries = readCentralDirectory(bytes);
  const workbook = await readPart(bytes, entries, 'xl/workbook.xml');
  if (workbook === null) {
    throw new Error(
      entries.has('EncryptedPackage')
        ? 'this workbook is password-protected — remove the password or save it as CSV'
        : 'not an .xlsx workbook (xl/workbook.xml is missing)',
    );
  }

  const targets = new Map<string, string>();
  const rels = await readPart(bytes, entries, 'xl/_rels/workbook.xml.rels');
  for (const m of (rels ?? '').matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attr(m[1], 'Id');
    const target = attr(m[1], 'Target');
    if (id && target) targets.set(id, partPath(target));
  }

  const shared = parseSharedStrings(await readPart(bytes, entries, 'xl/sharedStrings.xml'));

  const sheets: XlsxSheet[] = [];
  let position = 0;
  for (const m of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    position++;
    const name = attr(m[1], 'name') ?? `Sheet${position}`;
    const relId = attr(m[1], 'r:id');
    const path = (relId && targets.get(relId)) || `xl/worksheets/sheet${position}.xml`;
    const xml = await readPart(bytes, entries, path);
    // Chart sheets and macro sheets have no cell grid to read.
    if (xml === null || !/<sheetData\b/.test(xml)) continue;
    sheets.push({ name, rows: parseSheet(xml, shared) });
  }
  if (!sheets.length) throw new Error('the workbook has no worksheets with cells');
  return sheets;
}

/**
 * Rows as the tab-separated text a spreadsheet puts on the clipboard, so a
 * loaded workbook lands in the input box in the same shape as a paste.
 */
export function rowsToTsv(rows: string[][]): string {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  return rows
    .map((row) => {
      const cells: string[] = [];
      for (let c = 0; c < width; c++) {
        const cell = row[c] ?? '';
        cells.push(/[\t\n\r"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
      }
      return cells.join('\t').replace(/\t+$/, '');
    })
    .join('\n');
}
