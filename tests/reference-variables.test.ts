import { describe, expect, it } from 'vitest';
import {
  referenceSections,
  fillParts,
  fillPlaceholders,
  isSecretPlaceholder,
  placeholderLabel,
  placeholdersIn,
  sectionPlaceholders,
  checkVariableValue,
  describeVariable,
  markMatches,
  parseVariableCatalog,
  parseVariableLine,
  sharedVariables,
  type ReferenceSection,
} from '../src/lib/reference';

const section = (over: Partial<ReferenceSection>): ReferenceSection => ({
  id: 'x',
  title: 'X',
  topic: 'general',
  kind: 'diagnostics',
  ...over,
});

describe('reference variables', () => {
  it('finds placeholders once each, in first-seen order', () => {
    expect(placeholdersIn('get poe <switch-id> <port> and <switch-id>')).toEqual([
      '<switch-id>',
      '<port>',
    ]);
  });

  it('scans commands and snippet bodies, never prose', () => {
    const found = sectionPlaceholders(
      section({
        description: 'Replace every <placeholder>.',
        entries: [
          { command: 'diag a <peer-ip>', description: 'uses <not-a-field>' },
          { text: '<plain-text>' },
        ],
        snippets: [{ title: 'T <title-thing>', body: 'edit "<tunnel-name>"\nset x <peer-ip>' }],
      }),
    );
    expect(found).toEqual(['<peer-ip>', '<tunnel-name>']);
  });

  it('fills entered values and leaves the rest in place', () => {
    const values = new Map([
      ['<switch-id>', ' S108 '],
      ['<port>', '   '],
    ]);
    expect(fillPlaceholders('poe <switch-id> <port> <switch-id>', values)).toBe(
      'poe S108 <port> S108',
    );
  });

  it('does not re-substitute a value that looks like a placeholder', () => {
    const values = new Map([
      ['<a>', '<b>'],
      ['<b>', 'two'],
    ]);
    expect(fillPlaceholders('<a> <b>', values)).toBe('<b> two');
  });

  it('keeps special replacement patterns in values literal', () => {
    expect(fillPlaceholders('set psk <pre-shared-key>', new Map([['<pre-shared-key>', "$&$1$'"]]))).toBe(
      "set psk $&$1$'",
    );
  });

  it('reports which runs were substituted', () => {
    expect(fillParts('a <x> b <y>', new Map([['<x>', '1']]))).toEqual([
      { text: 'a ' },
      { text: '1', placeholder: '<x>' },
      { text: ' b <y>' },
    ]);
  });

  it('labels and classifies placeholders', () => {
    expect(placeholderLabel('<FortiSwitch_serial_number>')).toBe('FortiSwitch serial number');
    expect(isSecretPlaceholder('<pre-shared-key>')).toBe(true);
    expect(isSecretPlaceholder('<switch-id>')).toBe(false);
  });

  it('treats only real secrets in the bundled sheets as secret', () => {
    const secrets = new Set(referenceSections.flatMap(sectionPlaceholders).filter(isSecretPlaceholder));
    expect([...secrets]).toEqual(['<pre-shared-key>']);
  });
});

describe('search match marking', () => {
  it('returns the parts untouched without a query or a hit', () => {
    const parts = [{ text: 'get system status' }];
    expect(markMatches(parts, '')).toBe(parts);
    expect(markMatches(parts, 'zzz')).toBe(parts);
  });

  it('marks every occurrence, case-insensitively', () => {
    expect(markMatches([{ text: 'Diag diag' }], 'diag')).toEqual([
      { text: 'Diag', match: true },
      { text: ' ' },
      { text: 'diag', match: true },
    ]);
  });

  it('marks a hit that spans literal text and a filled-in value', () => {
    const parts = fillParts('host <host-ip> and', new Map([['<host-ip>', '10.1.2.3']]));
    expect(markMatches(parts, 'host 10.1')).toEqual([
      { text: 'host ', match: true },
      { text: '10.1', placeholder: '<host-ip>', match: true },
      { text: '.2.3', placeholder: '<host-ip>' },
      { text: ' and' },
    ]);
  });
});

describe('documented variables', () => {
  it('parses label, example and type', () => {
    expect(parseVariableLine('- <host-ip> (ip) - Host IP - e.g. 10.1.2.3')).toEqual({
      name: '<host-ip>',
      label: 'Host IP',
      example: '10.1.2.3',
      type: 'ip',
    });
    expect(parseVariableLine('- <pre-shared-key> - Pre-shared key')).toEqual({
      name: '<pre-shared-key>',
      label: 'Pre-shared key',
    });
  });

  it('ignores lines that are not variables and rejects unknown types', () => {
    expect(parseVariableLine('Some prose about <host-ip>.')).toBeNull();
    expect(parseVariableLine('`- <name> (type) - Label`')).toBeNull();
    expect(() => parseVariableLine('- <x> (ipv9) - X')).toThrow(/unknown type "ipv9"/);
  });

  it('rejects a catalogue that lists a placeholder twice', () => {
    expect(() => parseVariableCatalog('- <a> - A\n- <a> - Again')).toThrow(/listed twice/);
  });

  it('prefers the sheet, then the catalogue, then the name', () => {
    const shared = new Map([['<port>', { name: '<port>', label: 'Switch port' }]]);
    const own = section({ variables: [{ name: '<port>', label: 'Uplink' }] });
    expect(describeVariable('<port>', shared, own).label).toBe('Uplink');
    expect(describeVariable('<port>', shared, section({})).label).toBe('Switch port');
    expect(describeVariable('<trunk-name>', shared).label).toBe('trunk name');
  });

  it.each([
    ['ip', '10.1.2.3', true],
    ['ip', '2001:db8::1', true],
    ['ip', '10.1.2', false],
    ['ip', 'port1', false],
    ['cidr', '10.1.2.0/24', true],
    ['cidr', '10.1.2.0', false],
    ['cidr', '10.1.2.0/33', false],
    ['cidr', '2001:db8::/48', true],
    ['mask', '255.255.255.0', true],
    ['mask', '255.0.255.0', false],
    ['port', '443', true],
    ['port', '0', false],
    ['port', '70000', false],
    ['number', '6', true],
    ['number', 'tcp', false],
  ] as const)('checks %s value %s', (type, value, ok) => {
    expect(checkVariableValue(type, value) === null).toBe(ok);
  });

  it('never complains about a blank value or an untyped variable', () => {
    expect(checkVariableValue('ip', '  ')).toBeNull();
    expect(checkVariableValue(undefined, 'anything')).toBeNull();
  });

  it('only documents placeholders that some sheet uses, with valid examples', () => {
    const used = new Set(referenceSections.flatMap(sectionPlaceholders));
    for (const variable of sharedVariables.values()) {
      expect(used.has(variable.name), `${variable.name} is in the catalogue but unused`).toBe(true);
      expect(variable.label.trim()).not.toBe('');
      if (variable.example) {
        expect(checkVariableValue(variable.type, variable.example), variable.name).toBeNull();
      }
    }
  });

  it('only lets a sheet document placeholders it uses', () => {
    for (const s of referenceSections) {
      const used = sectionPlaceholders(s);
      for (const variable of s.variables ?? []) {
        expect(used, `${s.id}: ${variable.name}`).toContain(variable.name);
      }
    }
  });
});
