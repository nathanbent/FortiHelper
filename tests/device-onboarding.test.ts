import { describe, expect, it } from 'vitest';
import {
  apModelFromSerial,
  detectDelimiter,
  detectDeviceColumns,
  generateOnboarding,
  inventoryCsv,
  joinBatches,
  kindFromSerial,
  parseDeviceTable,
  readDevices,
  readXlsx,
  rowsToTsv,
  templateCsv,
} from '../src/lib/device-onboarding';
import type { Device } from '../src/lib/device-onboarding';

// @types/node is not installed in this project, so reach the node built-ins
// through process.getBuiltinModule with just the signatures used here.
declare const process: {
  getBuiltinModule(name: 'node:fs'): { readFileSync(path: URL): Uint8Array };
  getBuiltinModule(name: 'node:zlib'): { deflateRawSync(data: Uint8Array): Uint8Array };
};
const { readFileSync } = process.getBuiltinModule('node:fs');
const { deflateRawSync } = process.getBuiltinModule('node:zlib');

/** Parse, map, and read a device list the way the tool does. */
function load(text: string, kind: 'auto' | 'switch' | 'ap' = 'auto') {
  const table = parseDeviceTable(text);
  return readDevices(table, detectDeviceColumns(table), { kind });
}

const SHEET = [
  'Serial Number\tName\tComments\tFortiCloud Key',
  'S248EPTF00000001\tIDF1-SW1\tFirst floor IDF\tABCD-1234',
  'FP231FTF00000003\tAP-Lobby\tLobby ceiling\tEFGH-5678',
].join('\n');

describe('reading the device list', () => {
  it('reads a spreadsheet paste with a header', () => {
    const { devices, warnings } = load(SHEET);
    expect(warnings).toEqual([]);
    expect(devices).toEqual<Device[]>([
      {
        row: 2,
        serial: 'S248EPTF00000001',
        kind: 'switch',
        name: 'IDF1-SW1',
        comment: 'First floor IDF',
        cloudKey: 'ABCD-1234',
        group: '',
        profile: '',
      },
      {
        row: 3,
        serial: 'FP231FTF00000003',
        kind: 'ap',
        name: 'AP-Lobby',
        comment: 'Lobby ceiling',
        cloudKey: 'EFGH-5678',
        group: '',
        profile: '',
      },
    ]);
  });

  it('reads CSV with quoted commas', () => {
    const { devices } = load('serial,name,description\nS248EPTF00000001,SW1,"Rack 2, top"\n');
    expect(devices[0]).toMatchObject({ name: 'SW1', comment: 'Rack 2, top' });
  });

  it('detects the delimiter', () => {
    expect(detectDelimiter('a\tb')).toBe('\t');
    expect(detectDelimiter('a,b,c')).toBe(',');
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('"a;b",c')).toBe(',');
    expect(detectDelimiter('S248EPTF00000001')).toBe('\t');
  });

  it('takes columns in order when there is no header', () => {
    const { devices } = load('S248EPTF00000001,SW1,Rack 2,KEY1\nS248EPTF00000002,SW2,Rack 3,KEY2');
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({ row: 1, name: 'SW1', comment: 'Rack 2', cloudKey: 'KEY1' });
  });

  it('finds the serial column wherever it is', () => {
    const { devices } = load('SW1,S248EPTF00000001\nSW2,S248EPTF00000002');
    expect(devices.map((d) => [d.serial, d.name])).toEqual([
      ['S248EPTF00000001', 'SW1'],
      ['S248EPTF00000002', 'SW2'],
    ]);
  });

  it('treats unfamiliar labels above serials as a header', () => {
    const table = parseDeviceTable('Asset,Where\nS248EPTF00000001,Rack 2\nS248EPTF00000002,Rack 3');
    const cols = detectDeviceColumns(table);
    expect(cols.hasHeader).toBe(true);
    expect(readDevices(table, cols).devices).toHaveLength(2);
  });

  it('reads a bare list of serials', () => {
    const { devices } = load('s248eptf00000001\nFP231FTF00000003\n');
    expect(devices.map((d) => [d.serial, d.kind])).toEqual([
      ['S248EPTF00000001', 'switch'],
      ['FP231FTF00000003', 'ap'],
    ]);
  });

  it('honours Type, Group, and Profile columns', () => {
    const { devices } = load(
      'SN,Type,Group,Profile\nXX00000000000001,FortiAP,Floor1,Custom\nXX00000000000002,switch,Core,',
    );
    expect(devices.map((d) => [d.kind, d.group, d.profile])).toEqual([
      ['ap', 'Floor1', 'Custom'],
      ['switch', 'Core', ''],
    ]);
  });

  it('skips duplicates, blanks, and serials it cannot classify', () => {
    const { devices, warnings, skipped } = load(
      'serial,name\nS248EPTF00000001,a\nS248EPTF00000001,b\n,c\nXX00000000000001,d\nnot a serial!,e',
    );
    expect(devices).toHaveLength(1);
    expect(skipped).toBe(4);
    expect(warnings.map((w) => w.line)).toEqual([3, 4, 5, 6]);
    expect(warnings[0].message).toContain('already on row 2');
  });

  it('forces a device type when asked', () => {
    const { devices, warnings } = load('XX00000000000001', 'ap');
    expect(devices[0].kind).toBe('ap');
    expect(warnings).toEqual([]);
  });

  it('warns about an odd-length serial but keeps it', () => {
    const { devices, warnings } = load('S248EPTF0001');
    expect(devices).toHaveLength(1);
    expect(warnings[0].message).toContain('12 characters');
  });

  it('strips characters FortiOS refuses from names', () => {
    const { devices, warnings } = load('serial,name\nS248EPTF00000001,SW (main) #1');
    expect(devices[0].name).toBe('SW main 1');
    expect(warnings[0].kind).toBe('fix');
  });

  it('offers a CSV template that loads cleanly', () => {
    const table = parseDeviceTable(templateCsv());
    const cols = detectDeviceColumns(table);
    expect(cols).toEqual({
      hasHeader: true,
      serial: 0,
      name: 1,
      comment: 2,
      cloudKey: 3,
      kind: 4,
      group: 5,
      profile: 6,
    });
    const { devices, warnings } = readDevices(table, cols);
    expect(warnings).toEqual([]);
    expect(devices.map((d) => [d.kind, d.name])).toEqual([
      ['switch', 'IDF1-SW1'],
      ['ap', 'AP-Lobby'],
    ]);
  });

  it('classifies serials by prefix', () => {
    expect(kindFromSerial('S248EPTF00000001')).toBe('switch');
    expect(kindFromSerial('FS1E48T400000001')).toBe('switch');
    expect(kindFromSerial('FP231FTF00000001')).toBe('ap');
    expect(kindFromSerial('PU431FTF00000001')).toBe('ap');
    expect(kindFromSerial('FG100FTK00000001')).toBeNull();
    expect(apModelFromSerial('FP231FTF00000001')).toBe('231F');
    expect(apModelFromSerial('PU431FTF00000001')).toBe('U431F');
    expect(apModelFromSerial('S248EPTF00000001')).toBeNull();
  });
});

describe('generateOnboarding', () => {
  it('emits switch and AP entries with the defaults', () => {
    const { batches, warnings, stats } = generateOnboarding(load(SHEET).devices);
    expect(warnings).toEqual([]);
    expect(stats).toEqual({ switches: 1, aps: 1 });
    expect(batches).toHaveLength(1);
    expect(batches[0].output).toBe(
      [
        'config switch-controller managed-switch',
        '    edit "S248EPTF00000001"',
        '        set name "IDF1-SW1"',
        '        set description "First floor IDF"',
        '        set fsw-wan1-peer "fortilink"',
        '        set fsw-wan1-admin enable',
        '    next',
        'end',
        'config wireless-controller wtp',
        '    edit "FP231FTF00000003"',
        '        set admin enable',
        '        set name "AP-Lobby"',
        '        set location "Lobby ceiling"',
        '    next',
        'end',
        '',
      ].join('\n'),
    );
  });

  it('applies groups, profiles, and reject', () => {
    const { batches } = generateOnboarding(load(SHEET).devices, {
      switchAuth: 'reject',
      apAuth: 'keep',
      fortilink: 'fl-lag',
      switchGroup: 'Floor1',
      switchProfile: 'sp',
      accessProfile: 'acc',
      apGroup: 'Lobby APs',
      apProfile: 'FAP{model}-default',
      setName: false,
      setComment: false,
    });
    expect(batches[0].output).toBe(
      [
        'config switch-controller managed-switch',
        '    edit "S248EPTF00000001"',
        '        set fsw-wan1-peer "fl-lag"',
        '        set fsw-wan1-admin disable',
        '        set switch-profile "sp"',
        '        set access-profile "acc"',
        '    next',
        'end',
        'config switch-controller switch-group',
        '    edit "Floor1"',
        '        set fortilink "fl-lag"',
        '        append members "S248EPTF00000001"',
        '    next',
        'end',
        'config wireless-controller wtp',
        '    edit "FP231FTF00000003"',
        '        set wtp-profile "FAP231F-default"',
        '    next',
        'end',
        'config wireless-controller wtp-group',
        '    edit "Lobby APs"',
        '        set platform-type 231F',
        '        append wtps "FP231FTF00000003"',
        '    next',
        'end',
        '',
      ].join('\n'),
    );
  });

  const many = (n: number): Device[] =>
    load(
      Array.from({ length: n }, (_, i) => `S248EPTF${String(i + 1).padStart(8, '0')}`).join('\n'),
    ).devices;

  it('splits into batches that each stand alone', () => {
    const { batches } = generateOnboarding(many(120), { batchSize: 50, switchGroup: 'G' });
    expect(batches.map((b) => b.devices.length)).toEqual([50, 50, 20]);
    for (const b of batches) {
      expect(b.output.startsWith('config switch-controller managed-switch\n')).toBe(true);
      expect(b.output.endsWith('end\n')).toBe(true);
      expect(b.output.match(/^config /gm)).toHaveLength(2);
      expect(b.output.match(/^end$/gm)).toHaveLength(2);
      // Every device of the batch joins the group in that same batch.
      const members = b.output.match(/append members .*/g)!.join(' ').match(/"S[^"]+"/g)!;
      expect(members).toHaveLength(b.devices.length);
    }
    // No pasted line carries more than eight serials.
    expect(batches[0].output.match(/append members/g)).toHaveLength(7);
    expect(joinBatches(batches)).toContain('# --- Batch 3 of 3 (20 devices) ---');
  });

  it('puts everything in one batch when the size is 0', () => {
    expect(generateOnboarding(many(120), { batchSize: 0 }).batches).toHaveLength(1);
    expect(generateOnboarding([], {}).batches).toHaveLength(0);
  });

  it('warns when "set" members would be overwritten by a later batch', () => {
    const { warnings, batches } = generateOnboarding(many(4), {
      batchSize: 2,
      switchGroup: 'G',
      memberMode: 'set',
    });
    expect(batches[0].output).toContain('set members "S248EPTF00000001" "S248EPTF00000002"');
    expect(warnings.map((w) => w.message).join()).toContain('spans more than one batch');
  });

  it('cuts over-long comments and flags over-long names', () => {
    const long = 'x'.repeat(70);
    const { batches, warnings } = generateOnboarding(
      load(`serial,name,comment\nFP231FTF00000003,${'n'.repeat(40)},${long}\nS248EPTF00000001,sw,${long}`).devices,
    );
    expect(batches[0].output).toContain(`set location "${'x'.repeat(35)}"`);
    expect(batches[0].output).toContain(`set description "${'x'.repeat(63)}"`);
    expect(warnings).toHaveLength(3);
  });

  it('builds comments from the row, the bulk comment, and the key', () => {
    const { batches } = generateOnboarding(load(SHEET).devices.slice(0, 1), {
      bulkComment: 'PO "4411"',
      keyInComment: true,
    });
    expect(batches[0].output).toContain(
      `set description "First floor IDF - PO '4411' - FortiCloud key ABCD-1234"`,
    );
  });

  it('warns about a FortiAP group holding two models', () => {
    const { warnings } = generateOnboarding(load('FP231FTF00000003\nFP431FTF00000004').devices, {
      apGroup: 'All',
    });
    expect(warnings[0].message).toContain('231F, 431F');
  });

  it('exports the inventory with batch numbers and effective groups', () => {
    const { batches } = generateOnboarding(load(SHEET).devices, { batchSize: 1, switchGroup: 'G' });
    expect(inventoryCsv(batches)).toBe(
      'Batch,Type,Serial Number,Name,Comments,FortiCloud Key,Group,Profile\r\n' +
        '1,FortiSwitch,S248EPTF00000001,IDF1-SW1,First floor IDF,ABCD-1234,G,\r\n' +
        '2,FortiAP,FP231FTF00000003,AP-Lobby,Lobby ceiling,EFGH-5678,,\r\n',
    );
  });
});

/** Build a zip in memory: enough of the format for readXlsx to walk. */
function zip(files: Record<string, string>, compress: boolean): Uint8Array {
  const enc = new TextEncoder();
  const header = (size: number, fill: (v: DataView) => void): Uint8Array => {
    const bytes = new Uint8Array(size);
    fill(new DataView(bytes.buffer));
    return bytes;
  };
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = enc.encode(content);
    const data = compress ? deflateRawSync(raw) : raw;
    const nameBytes = enc.encode(name);
    chunks.push(
      header(30, (v) => {
        v.setUint32(0, 0x04034b50, true);
        v.setUint16(8, compress ? 8 : 0, true);
        v.setUint32(18, data.length, true);
        v.setUint32(22, raw.length, true);
        v.setUint16(26, nameBytes.length, true);
      }),
      nameBytes,
      data,
    );
    const at = offset;
    central.push(
      header(46, (v) => {
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(10, compress ? 8 : 0, true);
        v.setUint32(20, data.length, true);
        v.setUint32(24, raw.length, true);
        v.setUint16(28, nameBytes.length, true);
        v.setUint32(42, at, true);
      }),
      nameBytes,
    );
    offset += 30 + nameBytes.length + data.length;
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const count = Object.keys(files).length;
  const end = header(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, count, true);
    v.setUint16(10, count, true);
    v.setUint32(12, dirSize, true);
    v.setUint32(16, offset, true);
  });
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let pos = 0;
  for (const c of all) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

const WORKBOOK = {
  'xl/workbook.xml':
    '<workbook xmlns:r="x"><sheets><sheet name="Gear &amp; APs" sheetId="1" r:id="rId7"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':
    '<Relationships><Relationship Id="rId7" Type="t" Target="worksheets/data.xml"/></Relationships>',
  'xl/sharedStrings.xml':
    '<sst><si><t>Serial</t></si><si><r><t>AP-</t></r><r><t xml:space="preserve">Lobby </t></r><rPh><t>skip</t></rPh></si></sst>',
  'xl/worksheets/data.xml':
    '<worksheet><cols><col min="1" max="1"/></cols><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Note</t></is></c></row>' +
    '<row r="3"><c r="A3" t="str"><v>FP231FTF00000003</v></c><c r="B3" t="s"><v>1</v></c><c r="C3"><v>42</v></c><c r="D3" s="1"/></row>' +
    '</sheetData></worksheet>',
};

describe('readXlsx', () => {
  it('reads a workbook written by a spreadsheet library', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('./fixtures/onboarding-devices.xlsx', import.meta.url)));
    const sheets = await readXlsx(bytes);
    expect(sheets.map((s) => s.name)).toEqual(['Devices', 'Notes']);
    expect(sheets[0].rows).toEqual([
      ['Serial Number', 'Name', 'Comments', 'FortiCloud Key'],
      ['S248EPTF00000001', 'IDF1-SW1', 'First floor IDF', 'ABCD-1234'],
      ['S124EPTF00000002', 'IDF2-SW1', 'R&D <lab> "east"'],
      [],
      ['FP231FTF00000003', 'AP-Lobby', 'Lobby ceiling', 'EFGH-5678'],
      ['FP231FTF00000004', 'AP-Conf-A', '', '12345'],
    ]);

    // …and the text it becomes parses back into the same devices.
    const { devices, warnings } = load(rowsToTsv(sheets[0].rows));
    expect(warnings).toEqual([]);
    expect(devices.map((d) => d.row)).toEqual([2, 3, 5, 6]);
    expect(devices[1].comment).toBe('R&D <lab> "east"');
    expect(devices[3].cloudKey).toBe('12345');
  });

  for (const compress of [true, false]) {
    it(`reads ${compress ? 'deflated' : 'stored'} parts, rich text, inline strings, and row gaps`, async () => {
      const sheets = await readXlsx(zip(WORKBOOK, compress));
      expect(sheets).toEqual([
        {
          name: 'Gear & APs',
          rows: [['Serial', '', 'Note'], [], ['FP231FTF00000003', 'AP-Lobby', '42']],
        },
      ]);
    });
  }

  it('rejects files that are not workbooks', async () => {
    await expect(readXlsx(new TextEncoder().encode('serial,name\n'))).rejects.toThrow(/not an \.xlsx/);
    await expect(readXlsx(zip({ 'hello.txt': 'hi' }, false))).rejects.toThrow(/workbook\.xml is missing/);
  });
});
