import { describe, expect, it } from 'vitest';

import {
  columnLabel,
  detectSpreadsheetMapping,
  generateFromRecords,
  makeWarningCollector,
  parseSpreadsheet,
  spreadsheetRecords,
} from '../src/lib/object-helper';
import type { SpreadsheetMapping } from '../src/lib/object-helper';

const RESOLVED_AT = '2026-01-02 03:04:05Z';

function table(text: string) {
  return parseSpreadsheet(text);
}

describe('columnLabel', () => {
  it('produces spreadsheet-style letters', () => {
    expect(columnLabel(0)).toBe('A');
    expect(columnLabel(1)).toBe('B');
    expect(columnLabel(25)).toBe('Z');
    expect(columnLabel(26)).toBe('AA');
    expect(columnLabel(27)).toBe('AB');
  });
});

describe('parseSpreadsheet', () => {
  it('splits rows on newlines and cells on tabs', () => {
    const t = table('a\tb\tc\nd\te\tf\n');
    expect(t.rows).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
    expect(t.width).toBe(3);
  });

  it('handles CRLF line endings (Excel on Windows)', () => {
    const t = table('a\tb\r\nc\td\r\n');
    expect(t.rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('unquotes cells and unescapes doubled quotes', () => {
    const t = table('"say ""hi"""\tplain\n');
    expect(t.rows).toEqual([['say "hi"', 'plain']]);
  });

  it('keeps tabs and newlines inside quoted cells', () => {
    const t = table('"line one\nline two"\t"a\tb"\nnext\t2\n');
    expect(t.rows).toEqual([
      ['line one\nline two', 'a\tb'],
      ['next', '2'],
    ]);
  });

  it('drops trailing blank rows but keeps interior ones for numbering', () => {
    const t = table('a\n\nb\n\n\n');
    expect(t.rows).toEqual([['a'], [''], ['b']]);
  });

  it('trims cell whitespace', () => {
    const t = table('  a  \t  b  \n');
    expect(t.rows).toEqual([['a', 'b']]);
  });

  it('handles ragged rows and empty input', () => {
    expect(table('a\tb\nc\n').rows).toEqual([['a', 'b'], ['c']]);
    expect(table('a\tb\nc\n').width).toBe(2);
    expect(table('').rows).toEqual([]);
    expect(table('').width).toBe(0);
  });
});

describe('detectSpreadsheetMapping', () => {
  it('detects a keyword header row and maps columns from it', () => {
    const t = table('Name\tIP Address\tComment\nweb\t10.0.0.1\tweb server\n');
    expect(detectSpreadsheetMapping(t)).toEqual({
      hasHeader: true,
      nameCol: 0,
      valueCol: 1,
      commentCol: 2,
    });
  });

  it('detects a header without known keywords when only data rows parse', () => {
    const t = table('Server\tWo die Kiste steht\nweb.example.com\tRack 4\n');
    const m = detectSpreadsheetMapping(t);
    expect(m.hasHeader).toBe(true);
    expect(m.valueCol).toBe(0);
    expect(m.commentCol).toBe(1);
  });

  it('maps a headerless Name | Address | Comment layout positionally', () => {
    const t = table('web\t10.0.0.1\tweb server\napp\t10.0.0.0/24\tapp subnet\n');
    expect(detectSpreadsheetMapping(t)).toEqual({
      hasHeader: false,
      nameCol: 0,
      valueCol: 1,
      commentCol: 2,
    });
  });

  it('handles a single bare column of values', () => {
    const t = table('example.com\n10.0.0.5\n');
    expect(detectSpreadsheetMapping(t)).toEqual({
      hasHeader: false,
      nameCol: null,
      valueCol: 0,
      commentCol: null,
    });
  });

  it('returns no value column when nothing parses', () => {
    const t = table('foo\tbar\nbaz\tqux\n');
    expect(detectSpreadsheetMapping(t).valueCol).toBe(null);
  });

  it('picks the column with the most address-like cells', () => {
    // Column B is addresses throughout; column A only looks like one once.
    const t = table('web-1\t10.0.0.1\nweb.example.com\t10.0.0.2\nweb-3\t10.0.0.3\n');
    const m = detectSpreadsheetMapping(t);
    expect(m.valueCol).toBe(1);
    expect(m.nameCol).toBe(0);
  });

  it('prefers an IP/CIDR column over an FQDN-shaped interface column', () => {
    // "x1.4" etc. validate as FQDNs, but real addresses must win the vote.
    const t = table(
      ['Data-VLAN\tx1.4\t172.17.4.1/24\tVLAN4', 'Mgmt-VLAN\tx1.254\t10.0.254.1/24\tVLAN254'].join(
        '\n',
      ) + '\n',
    );
    expect(detectSpreadsheetMapping(t)).toEqual({
      hasHeader: false,
      nameCol: 0,
      valueCol: 2,
      commentCol: 3,
    });
  });
});

describe('spreadsheetRecords', () => {
  const mapping: SpreadsheetMapping & { valueCol: number } = {
    hasHeader: true,
    nameCol: 0,
    valueCol: 1,
    commentCol: 2,
  };

  it('skips the header row and builds records', () => {
    const t = table('Name\tAddress\tComment\nweb\t10.0.0.1\tweb server\ncdn\texample.com\t\n');
    const { warnings, warn } = makeWarningCollector();
    const records = spreadsheetRecords(t, mapping, warn);
    expect(warnings).toEqual([]);
    expect(records).toEqual([
      { lineno: 2, name: 'web', value: '10.0.0.1', comment: 'web server' },
      { lineno: 3, name: 'cdn', value: 'example.com', comment: null },
    ]);
  });

  it('skips blank rows silently and warns on a missing address cell', () => {
    const t = table('Name\tAddress\nweb\t\n\nspare\t10.0.0.2\n');
    const { warnings, warn } = makeWarningCollector();
    const records = spreadsheetRecords(t, { ...mapping, commentCol: null }, warn);
    expect(records).toEqual([{ lineno: 4, name: 'spare', value: '10.0.0.2', comment: null }]);
    expect(warnings).toEqual([
      { line: 2, message: 'Row has nothing in the address column (B); skipping.' },
    ]);
  });

  it('turns an empty name cell into null so naming falls back to the value', () => {
    const t = table('Name\tAddress\n\texample.com\n');
    const records = spreadsheetRecords(t, { ...mapping, commentCol: null }, () => {});
    expect(records).toEqual([{ lineno: 2, name: null, value: 'example.com', comment: null }]);
  });

  it('strips surrounding double quotes from names like the classic modes do', () => {
    const t = table('"web srv"\t10.0.0.1\n');
    const records = spreadsheetRecords(
      t,
      { hasHeader: false, nameCol: 0, valueCol: 1, commentCol: null },
      () => {},
    );
    expect(records[0].name).toBe('web srv');
  });
});

describe('generateFromRecords with spreadsheet input', () => {
  it('generates named, commented objects end to end', () => {
    const t = table(
      [
        'Name\tAddress\tComment',
        'web-prod\texample.com\tProduction web',
        'app-net\t10.20.0.0/24\tApp subnet',
        '\t10.0.0.53\tInternal resolver',
      ].join('\n') + '\n',
    );
    const mapping = detectSpreadsheetMapping(t);
    expect(mapping.valueCol).toBe(1);
    const { warn } = makeWarningCollector();
    const records = spreadsheetRecords(t, { ...mapping, valueCol: 1 }, warn);
    const result = generateFromRecords(records, {
      useExplicitNames: true,
      resolvedAt: RESOLVED_AT,
    });

    expect(result.output).toContain('edit "Prefix-web-prod"');
    expect(result.output).toContain('set fqdn "example.com"');
    expect(result.output).toContain('set comment "Production web"');
    expect(result.output).toContain('edit "Prefix-app-net"');
    expect(result.output).toContain('set subnet 10.20.0.0 255.255.255.0');
    // Empty name cell: the object is named after its address instead.
    expect(result.output).toContain('edit "Prefix-10.0.0.53"');
    expect(result.output).toContain('set comment "Internal resolver"');
    expect(result.stats.total).toBe(3);
    expect(result.warnings).toEqual([]);
  });

  it('imports a VLAN interface table: name | interface | gateway/prefix | VLAN', () => {
    // The shape of a switch/firewall VLAN sheet: no header, an interface
    // column the mapping must skip, and gateway IPs whose host bits are
    // masked off so the objects describe the VLAN subnets.
    const t = table(
      [
        'Legacy-VLAN\tx1.1\t172.16.1.2/16\tVLAN1',
        'Data-VLAN\tx1.4\t172.17.4.1/24\tVLAN4',
        'Guest-VLAN\tx1.250\t10.250.0.1/19\tVLAN250',
      ].join('\n') + '\n',
    );
    const mapping = detectSpreadsheetMapping(t);
    expect(mapping).toEqual({ hasHeader: false, nameCol: 0, valueCol: 2, commentCol: 3 });
    const records = spreadsheetRecords(t, { ...mapping, valueCol: 2 }, () => {});
    const result = generateFromRecords(records, {
      useExplicitNames: true,
      resolvedAt: RESOLVED_AT,
    });

    expect(result.output).toContain('edit "Prefix-Legacy-VLAN"');
    expect(result.output).toContain('set subnet 172.16.0.0 255.255.0.0');
    expect(result.output).toContain('edit "Prefix-Data-VLAN"');
    expect(result.output).toContain('set subnet 172.17.4.0 255.255.255.0');
    expect(result.output).toContain('set comment "VLAN4"');
    expect(result.output).toContain('edit "Prefix-Guest-VLAN"');
    expect(result.output).toContain('set subnet 10.250.0.0 255.255.224.0');
    expect(result.output).not.toContain('x1.'); // interface column ignored
    expect(result.stats.writtenDirectIp).toBe(3);
    expect(result.warnings).toEqual([]);
  });
});
