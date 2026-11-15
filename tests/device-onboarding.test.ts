import { describe, expect, it } from 'vitest';
import {
  apModelFromSerial,
  checkBatches,
  checkCommands,
  detectDelimiter,
  detectDeviceColumns,
  generateOnboarding,
  inventoryCsv,
  joinBatches,
  kindFromSerial,
  parseDeviceTable,
  parseExistingState,
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
    expect(stats).toEqual({ switches: 1, aps: 1, fresh: 2, changed: 0, done: 0 });
    expect(batches).toHaveLength(1);
    expect(batches[0].output).toBe(
      [
        'config switch-controller managed-switch',
        '    rename "S248EPTF00000001" to "IDF1-SW1"',
        '    edit "IDF1-SW1"',
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

  it('uses set name on a switch for FortiOS 7.2 and earlier', () => {
    const { batches } = generateOnboarding(load(SHEET).devices.slice(0, 1), {
      switchNaming: 'set-name',
    });
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

  it('renames switches from serial to name when asked, leaving APs alone', () => {
    const { batches, warnings } = generateOnboarding(load(SHEET).devices, {
      switchNaming: 'rename',
      switchGroup: 'Floor1',
    });
    expect(warnings).toEqual([]);
    expect(batches[0].output).toBe(
      [
        'config switch-controller managed-switch',
        '    rename "S248EPTF00000001" to "IDF1-SW1"',
        '    edit "IDF1-SW1"',
        '        set description "First floor IDF"',
        '        set fsw-wan1-peer "fortilink"',
        '        set fsw-wan1-admin enable',
        '    next',
        'end',
        'config switch-controller switch-group',
        '    edit "Floor1"',
        '        set fortilink "fortilink"',
        '        append members "IDF1-SW1"',
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

  it('keeps the serial as the ID when a rename has no usable name', () => {
    const { batches, warnings } = generateOnboarding(
      load(
        'serial,name\nS248EPTF00000001,\nS248EPTF00000002,Core SW\nS248EPTF00000003,dup\nS248EPTF00000004,DUP',
      ).devices,
      { switchNaming: 'rename' },
    );
    const out = batches[0].output;
    expect(out.match(/^ {4}rename .*/gm)).toEqual([
      '    rename "S248EPTF00000002" to "Core SW"',
      '    rename "S248EPTF00000003" to "dup"',
    ]);
    expect(out).toContain('edit "S248EPTF00000001"');
    expect(out).toContain('edit "S248EPTF00000004"');
    // FortiOS 7.4+ has no "set name" on a switch, so none is emitted here.
    expect(out).not.toContain('set name');
    const messages = warnings.map((w) => w.message).join('\n');
    expect(messages).toContain('"Core SW" may be refused as a switch ID');
    expect(messages).toContain('"DUP" is already the ID of S248EPTF00000003');
  });

  it('creates a switch under its name with set sn when it is not connected yet', () => {
    const { batches } = generateOnboarding(load(SHEET).devices.slice(0, 1), {
      switchNaming: 'preconfigure',
      switchGroup: 'Floor1',
    });
    expect(batches[0].output).toBe(
      [
        'config switch-controller managed-switch',
        '    edit "IDF1-SW1"',
        '        set sn "S248EPTF00000001"',
        '        set description "First floor IDF"',
        '        set fsw-wan1-peer "fortilink"',
        '        set fsw-wan1-admin enable',
        '    next',
        'end',
        'config switch-controller switch-group',
        '    edit "Floor1"',
        '        set fortilink "fortilink"',
        '        append members "IDF1-SW1"',
        '    next',
        'end',
        '',
      ].join('\n'),
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

    // ...and the text it becomes parses back into the same devices.
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

describe('comparing against the FortiGate', () => {
  const LIST = [
    'serial,name,comments',
    'S248EPTF00000001,IDF1-SW1,First floor IDF',
    'S248EPTF00000002,IDF2-SW1,Second floor IDF',
    'S248EPTF00000003,IDF3-SW1,Third floor IDF',
    'FP231FTF00000004,AP-Lobby,Lobby ceiling',
    'FP231FTF00000005,AP-Conf,Conference room',
  ].join('\n');

  // As "show" prints it: defaults left out, a prompt and a pager line mixed in.
  const SHOWN = [
    'FGT # show switch-controller managed-switch',
    'config switch-controller managed-switch',
    '    edit "S248EPTF00000001"',
    '        set name "IDF1-SW1"',
    '        set description "First floor IDF"',
    '        set fsw-wan1-peer "fortilink"',
    '        set fsw-wan1-admin enable',
    '        config ports',
    '            edit "port1"',
    '                set description "not the switch description"',
    '            next',
    '        end',
    '    next',
    '    edit "S248EPTF00000002"',
    '        set fsw-wan1-peer "fortilink"',
    '    next',
    '    edit "S248EPTF00000099"',
    '        set fsw-wan1-peer "fortilink"',
    '    next',
    'end',
    'config switch-controller switch-group',
    '    edit "Floor1"',
    '        set fortilink "fortilink"',
    '        set members "S248EPTF00000001"',
    '    next',
    'end',
    'config wireless-controller wtp',
    '    edit "FP231FTF00000004"',
    '        set name "AP-Lobby"',
    '        set location "Lobby ceiling"',
    '        set wtp-profile "FAP231F-default"',
    '    next',
    'end',
  ].join('\n');

  it('reads switches, APs, and groups out of show output', () => {
    const state = parseExistingState(SHOWN)!;
    expect(state.switches!.map((sw) => [sw.id, sw.admin, sw.description])).toEqual([
      ['S248EPTF00000001', 'enable', 'First floor IDF'],
      ['S248EPTF00000002', 'discovered', ''],
      ['S248EPTF00000099', 'discovered', ''],
    ]);
    expect(state.aps).toEqual([
      {
        serial: 'FP231FTF00000004',
        admin: 'enable',
        name: 'AP-Lobby',
        location: 'Lobby ceiling',
        profile: 'FAP231F-default',
      },
    ]);
    expect(state.switchGroups![0].members).toEqual(['S248EPTF00000001']);
    expect(state.apGroups).toBeNull();
    expect(state.namedSwitchIds).toBe(false);
    expect(parseExistingState('')).toBeNull();
    expect(parseExistingState('config firewall policy\nend')).toBeNull();
  });

  it('emits only what is missing or different', () => {
    const result = generateOnboarding(
      load(LIST).devices,
      { switchNaming: 'set-name', switchGroup: 'Floor1', apProfile: 'FAP{model}-default' },
      parseExistingState(SHOWN),
    );
    expect(result.plan.map((p) => [p.device.serial, p.status, p.changes, p.batch])).toEqual([
      ['S248EPTF00000001', 'done', [], null],
      ['S248EPTF00000002', 'change', ['name', 'description', 'approval', 'group'], 1],
      ['S248EPTF00000003', 'new', [], 1],
      ['FP231FTF00000004', 'done', [], null],
      ['FP231FTF00000005', 'new', [], 1],
    ]);
    expect(result.stats).toEqual({ switches: 3, aps: 2, fresh: 2, changed: 1, done: 2 });
    expect(result.unlisted).toEqual([{ kind: 'switch', id: 'S248EPTF00000099', serial: 'S248EPTF00000099' }]);
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0].output).toBe(
      [
        'config switch-controller managed-switch',
        '    edit "S248EPTF00000002"',
        '        set name "IDF2-SW1"',
        '        set description "Second floor IDF"',
        '        set fsw-wan1-admin enable',
        '    next',
        '    edit "S248EPTF00000003"',
        '        set name "IDF3-SW1"',
        '        set description "Third floor IDF"',
        '        set fsw-wan1-peer "fortilink"',
        '        set fsw-wan1-admin enable',
        '    next',
        'end',
        'config switch-controller switch-group',
        '    edit "Floor1"',
        '        append members "S248EPTF00000002" "S248EPTF00000003"',
        '    next',
        'end',
        'config wireless-controller wtp',
        '    edit "FP231FTF00000005"',
        '        set admin enable',
        '        set name "AP-Conf"',
        '        set location "Conference room"',
        '        set wtp-profile "FAP231F-default"',
        '    next',
        'end',
        '',
      ].join('\n'),
    );
    expect(inventoryCsv(result.batches, result.plan.filter((p) => p.status === 'done').map((p) => p.device))).toContain(
      'done,FortiSwitch,S248EPTF00000001,IDF1-SW1,First floor IDF,,Floor1,',
    );
  });

  it('has nothing to emit once the FortiGate matches the list', () => {
    const devices = load('serial,name,comments\nS248EPTF00000001,IDF1-SW1,First floor IDF').devices;
    const result = generateOnboarding(devices, { switchNaming: 'set-name' }, parseExistingState(SHOWN));
    expect(result.batches).toEqual([]);
    expect(result.plan[0].status).toBe('done');
  });

  it('generates a section in full when it was not pasted', () => {
    const onlyAps = SHOWN.slice(SHOWN.indexOf('config wireless-controller wtp'));
    const result = generateOnboarding(load(LIST).devices, {}, parseExistingState(onlyAps));
    expect(result.plan.map((p) => p.status)).toEqual(['new', 'new', 'new', 'done', 'new']);
  });

  const NAMED = [
    'config vdom',
    'edit root',
    'config switch-controller managed-switch',
    '    edit "Core"',
    '        set sn "S248EPTF00000001"',
    '        set fsw-wan1-peer "fortilink"',
    '        set fsw-wan1-admin enable',
    '    next',
    '    edit "S248EPTF00000002"',
    '        set sn "S248EPTF00000002"',
    '        set fsw-wan1-peer "fortilink"',
    '        set fsw-wan1-admin enable',
    '    next',
    'end',
    'config switch-controller switch-group',
    '    edit "Floor1"',
    '        set fortilink "fortilink"',
    '        set members "Core"',
    '    next',
    'end',
    'end',
  ].join('\n');

  it('renames what is there and pre-configures what is not, on a FortiGate with named IDs', () => {
    const state = parseExistingState(NAMED)!;
    expect(state.namedSwitchIds).toBe(true);
    expect(state.switches!.map((sw) => [sw.id, sw.serial])).toEqual([
      ['Core', 'S248EPTF00000001'],
      ['S248EPTF00000002', 'S248EPTF00000002'],
    ]);
    const devices = load(
      'serial,name\nS248EPTF00000001,IDF1-SW1\nS248EPTF00000002,IDF2-SW1\nS248EPTF00000003,IDF3-SW1',
    ).devices;
    const result = generateOnboarding(devices, { switchNaming: 'rename', switchGroup: 'Floor1' }, state);
    expect(result.batches[0].output).toBe(
      [
        'config switch-controller managed-switch',
        '    rename "Core" to "IDF1-SW1"',
        '    rename "S248EPTF00000002" to "IDF2-SW1"',
        '    edit "IDF3-SW1"',
        '        set sn "S248EPTF00000003"',
        '        set fsw-wan1-peer "fortilink"',
        '        set fsw-wan1-admin enable',
        '    next',
        'end',
        'config switch-controller switch-group',
        '    edit "Floor1"',
        '        append members "IDF2-SW1" "IDF3-SW1"',
        '    next',
        'end',
        '',
      ].join('\n'),
    );
    // The switch already in the group under its old ID is not added again.
    expect(result.plan[0].changes).toEqual(['rename']);
  });

  it('warns that set name will be refused where switch IDs are names', () => {
    const devices = load('serial,name\nS248EPTF00000001,IDF1-SW1').devices;
    const { warnings } = generateOnboarding(
      devices,
      { switchNaming: 'set-name' },
      parseExistingState(NAMED),
    );
    expect(warnings.map((w) => w.message).join()).toContain('"set name" does not exist');
  });
});

describe('checking that a batch took', () => {
  const LIST = [
    'serial,name,comments',
    'S248EPTF00000001,IDF1-SW1,First floor IDF',
    'S248EPTF00000002,IDF2-SW1,Second floor IDF',
    'FP231FTF00000004,AP-Lobby,Lobby ceiling',
    'FP231FTF00000005,AP-Conf,Conference room',
  ].join('\n');
  const OPTIONS = { batchSize: 2, switchGroup: 'Floor1' };
  const devices = load(LIST).devices;
  const result = generateOnboarding(devices, OPTIONS);

  it('lists only the show commands for what the batch writes', () => {
    expect(result.batches.map(checkCommands)).toEqual([
      ['show switch-controller managed-switch', 'show switch-controller switch-group'],
      ['show wireless-controller wtp'],
    ]);
  });

  // Batch 1 applied in full, except the second switch never joined the group.
  const AFTER_SWITCHES = [
    'config switch-controller managed-switch',
    '    edit "IDF1-SW1"',
    '        set sn "S248EPTF00000001"',
    '        set description "First floor IDF"',
    '        set fsw-wan1-peer "fortilink"',
    '        set fsw-wan1-admin enable',
    '    next',
    '    edit "IDF2-SW1"',
    '        set sn "S248EPTF00000002"',
    '        set description "Second floor IDF"',
    '        set fsw-wan1-peer "fortilink"',
    '        set fsw-wan1-admin enable',
    '    next',
    'end',
  ].join('\n');
  const AFTER_GROUP = [
    'config switch-controller switch-group',
    '    edit "Floor1"',
    '        set fortilink "fortilink"',
    '        set members "IDF1-SW1"',
    '    next',
    'end',
  ].join('\n');

  it('confirms, flags, and leaves unchecked per device', () => {
    const checks = checkBatches(
      devices,
      OPTIONS,
      result,
      parseExistingState(`${AFTER_SWITCHES}\n${AFTER_GROUP}`)!,
    );
    expect(checks.map((c) => [c.index, c.confirmed, c.pending, c.unchecked])).toEqual([
      [1, 1, 1, 0],
      [2, 0, 0, 2],
    ]);
    expect(checks[0].devices.map((d) => [d.device.serial, d.state, d.detail])).toEqual([
      ['S248EPTF00000001', 'confirmed', ''],
      ['S248EPTF00000002', 'pending', 'still differs: group'],
    ]);
    expect(checks[1].devices[0].detail).toBe('no output of "show wireless-controller wtp"');
  });

  it('does not call a group unjoined when the group output is missing', () => {
    const checks = checkBatches(devices, OPTIONS, result, parseExistingState(AFTER_SWITCHES)!);
    expect(checks[0].devices.map((d) => [d.state, d.detail])).toEqual([
      ['unchecked', 'group not checked: no output of "show switch-controller switch-group"'],
      ['unchecked', 'group not checked: no output of "show switch-controller switch-group"'],
    ]);
  });

  it('reports a device that is not there, and one that still differs', () => {
    const partial = [
      'config wireless-controller wtp',
      '    edit "FP231FTF00000004"',
      '        set admin discovered',
      '        set name "AP-Lobby"',
      '        set location "Lobby ceiling"',
      '    next',
      'end',
    ].join('\n');
    const checks = checkBatches(devices, OPTIONS, result, parseExistingState(partial)!);
    expect(checks[1].devices.map((d) => [d.state, d.detail])).toEqual([
      ['pending', 'still differs: approval'],
      ['pending', 'not on the FortiGate'],
    ]);
  });

  it('confirms every batch once everything is there', () => {
    const all = [
      AFTER_SWITCHES,
      AFTER_GROUP.replace('"IDF1-SW1"\n', '"IDF1-SW1" "IDF2-SW1"\n'),
      'config wireless-controller wtp',
      '    edit "FP231FTF00000004"',
      '        set name "AP-Lobby"',
      '        set location "Lobby ceiling"',
      '    next',
      '    edit "FP231FTF00000005"',
      '        set name "AP-Conf"',
      '        set location "Conference room"',
      '    next',
      'end',
    ].join('\n');
    const checks = checkBatches(devices, OPTIONS, result, parseExistingState(all)!);
    expect(checks.every((c) => c.confirmed === c.devices.length)).toBe(true);
  });
});

describe('name patterns', () => {
  const names = (text: string, options: Parameters<typeof generateOnboarding>[1]) =>
    generateOnboarding(load(text).devices, options).plan.map((p) => p.device.name);

  it('numbers unnamed devices per kind and leaves named rows alone', () => {
    expect(
      names(
        'serial,name\nS248EPTF00000001,\nS248EPTF00000002,Core\nS248EPTF00000003,\nFP231FTF00000004,\nFP231FTF00000005,',
        { switchNamePattern: 'IDF-SW{n:2}', apNamePattern: 'AP-{n}', nameStart: 9 },
      ),
    ).toEqual(['IDF-SW09', 'Core', 'IDF-SW10', 'AP-9', 'AP-10']);
  });

  it('counts within a group and fills in serial, model, and group', () => {
    expect(
      names(
        'serial,group\nFP231FTF00001234,Lobby\nFP431FTF00005678,Hall\nFP231FTF00009012,Lobby\nS248EPTF00003456,Core\nFS1E48T400007890,Core',
        {
          apNamePattern: '{group}-{model}-{gn:2}',
          switchNamePattern: '{model}-{last4}-{serial}',
        },
      ),
    ).toEqual([
      'Lobby-231F-01',
      'Hall-431F-01',
      'Lobby-231F-02',
      '248EP-3456-S248EPTF00003456',
      '1E48-7890-FS1E48T400007890',
    ]);
  });

  it('uses the generated name in the config', () => {
    const { batches, warnings } = generateOnboarding(load('S248EPTF00000001\nFP231FTF00000004').devices, {
      switchNamePattern: 'SW{n}',
      apNamePattern: 'AP{n}',
    });
    expect(warnings).toEqual([]);
    expect(batches[0].output).toContain('rename "S248EPTF00000001" to "SW1"');
    expect(batches[0].output).toContain('set name "AP1"');
  });

  it('warns about an unknown placeholder and a clash with a typed name', () => {
    const { warnings, plan } = generateOnboarding(
      load('serial,name\nS248EPTF00000001,SW1\nS248EPTF00000002,').devices,
      { switchNamePattern: 'SW{n}' },
    );
    expect(plan[1].device.name).toBe('SW1');
    expect(warnings.map((w) => w.message).join()).toContain('which row 2 already has');
    const odd = generateOnboarding(load('S248EPTF00000001').devices, { switchNamePattern: '{site}-{n}' });
    expect(odd.plan[0].device.name).toBe('{site}-1');
    expect(odd.warnings.map((w) => w.message).join()).toContain('{site} is not a placeholder');
  });

  it('does nothing when names are switched off', () => {
    expect(names('S248EPTF00000001', { switchNamePattern: 'SW{n}', setName: false })).toEqual(['']);
  });
});
