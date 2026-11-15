import { describe, expect, it } from 'vitest';
import {
  referenceSections,
  fillParts,
  fillPlaceholders,
  isSecretPlaceholder,
  placeholderLabel,
  placeholdersIn,
  sectionPlaceholders,
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
