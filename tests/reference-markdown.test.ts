import { describe, expect, it } from 'vitest';
import { parseSheet } from '../src/lib/reference/markdown';

const FRONT = ['---', 'id: demo', 'title: Demo sheet', 'topic: ipsec', 'kind: diagnostics', '---'];
const sheet = (...body: string[]) => [...FRONT, '', ...body].join('\n');

describe('parseSheet front matter', () => {
  it('reads the required fields', () => {
    const s = parseSheet(sheet('`get system status`'));
    expect(s).toMatchObject({
      id: 'demo',
      title: 'Demo sheet',
      topic: 'ipsec',
      kind: 'diagnostics',
      order: 100,
    });
  });

  it('reads the optional fields', () => {
    const s = parseSheet(
      ['---', 'id: d', 'title: T', 'topic: ipsec', 'kind: diagnostics', 'copyAll: true', 'order: 5', 'description: From front matter', '---', '', '`a`', '`b`'].join('\n'),
    );
    expect(s.copyAll).toBe(true);
    expect(s.order).toBe(5);
    expect(s.description).toBe('From front matter');
  });

  it('omits copyAll unless it is exactly true', () => {
    expect(parseSheet(sheet('`a`')).copyAll).toBeUndefined();
  });

  it('rejects a file with no front matter', () => {
    expect(() => parseSheet('# Just a note\n\n`a`', 'note.md')).toThrow(/missing front matter/);
  });

  it('rejects unclosed front matter', () => {
    expect(() => parseSheet('---\nid: d\n', 'x.md')).toThrow(/never closed/);
  });

  it('rejects a missing required field', () => {
    expect(() => parseSheet('---\nid: d\ntitle: T\ntopic: ipsec\n---\n\n`a`', 'x.md')).toThrow(
      /missing "kind"/,
    );
  });

  it('rejects an unknown topic or kind, naming the file', () => {
    expect(() =>
      parseSheet('---\nid: d\ntitle: T\ntopic: nope\nkind: diagnostics\n---\n\n`a`', 'bad.md'),
    ).toThrow(/bad\.md: unknown topic "nope"/);
    expect(() =>
      parseSheet('---\nid: d\ntitle: T\ntopic: ipsec\nkind: nope\n---\n\n`a`', 'bad.md'),
    ).toThrow(/unknown kind "nope"/);
  });

  it('rejects a non-numeric order', () => {
    expect(() =>
      parseSheet('---\nid: d\ntitle: T\ntopic: ipsec\nkind: diagnostics\norder: soon\n---\n\n`a`'),
    ).toThrow(/order "soon" is not a number/);
  });
});

describe('parseSheet commands', () => {
  it('reads a command with a description', () => {
    const s = parseSheet(sheet('`get system status` - Model and firmware'));
    expect(s.entries).toEqual([
      { command: 'get system status', description: 'Model and firmware' },
    ]);
  });

  it('reads a command with no description', () => {
    expect(parseSheet(sheet('`diagnose debug enable`')).entries).toEqual([
      { command: 'diagnose debug enable' },
    ]);
  });

  it('accepts bullets and dash variants', () => {
    const s = parseSheet(sheet('- `a` - one', '* `b` — two', '`c` – three'));
    expect(s.entries).toEqual([
      { command: 'a', description: 'one' },
      { command: 'b', description: 'two' },
      { command: 'c', description: 'three' },
    ]);
  });

  it('keeps dashes inside a description', () => {
    const s = parseSheet(sheet('`a` - Debug the IKE daemon - all levels'));
    expect(s.entries![0].description).toBe('Debug the IKE daemon - all levels');
  });

  it('keeps angle-bracket arguments in a command', () => {
    const s = parseSheet(sheet('`diagnose vpn tunnel flush <phase1-name>` - Flush one tunnel'));
    expect(s.entries![0].command).toBe('diagnose vpn tunnel flush <phase1-name>');
  });
});

describe('parseSheet blocks', () => {
  it('treats a plain fence as a config snippet, titled by the heading above it', () => {
    const s = parseSheet(sheet('### Phase 1', '```', 'config vpn ipsec phase1-interface', 'end', '```'));
    expect(s.snippets).toEqual([
      { title: 'Phase 1', body: 'config vpn ipsec phase1-interface\nend' },
    ]);
    expect(s.entries).toBeUndefined();
  });

  it('falls back to the sheet title when a snippet has no heading', () => {
    const s = parseSheet(sheet('```', 'config a', 'end', '```'));
    expect(s.snippets![0].title).toBe('Demo sheet');
  });

  it('does not reuse one heading for two snippets', () => {
    const s = parseSheet(sheet('### One', '```', 'a', 'b', '```', '```', 'c', 'd', '```'));
    expect(s.snippets!.map((x) => x.title)).toEqual(['One', 'Demo sheet']);
  });

  it('turns a ```commands fence into one row per line', () => {
    const s = parseSheet(sheet('```commands', 'diag debug reset', '', 'diag debug disable', '```'));
    expect(s.entries).toEqual([
      { command: 'diag debug reset' },
      { command: 'diag debug disable' },
    ]);
  });

  it('turns a ```colors fence into rows with swatches', () => {
    const s = parseSheet(sheet('```colors', '1 - Black', '12 - Brown', '```'));
    expect(s.entries).toEqual([
      { text: '1', description: 'Black', swatch: 1 },
      { text: '12', description: 'Brown', swatch: 12 },
    ]);
  });

  it('rejects a malformed colours row', () => {
    expect(() => parseSheet(sheet('```colors', 'Black', '```'), 'c.md')).toThrow(
      /colors row is not/,
    );
  });

  it('rejects an unclosed fence and an empty one', () => {
    expect(() => parseSheet(sheet('```', 'config a'), 'x.md')).toThrow(/never closed/);
    expect(() => parseSheet(sheet('```', '```'), 'x.md')).toThrow(/empty/);
  });
});

describe('parseSheet description', () => {
  it('uses the prose before the first command', () => {
    const s = parseSheet(sheet('Start here, before any debug.', '', '`get system status`'));
    expect(s.description).toBe('Start here, before any debug.');
  });

  it('joins multiple intro lines', () => {
    const s = parseSheet(sheet('One line.', 'And another.', '', '`a`'));
    expect(s.description).toBe('One line. And another.');
  });

  it('ignores prose that comes after content', () => {
    const s = parseSheet(sheet('`a`', '', 'A trailing remark.'));
    expect(s.description).toBeUndefined();
  });

  it('prefers front matter over intro prose', () => {
    const s = parseSheet(
      ['---', 'id: d', 'title: T', 'topic: ipsec', 'kind: diagnostics', 'description: Explicit', '---', '', 'Intro prose.', '', '`a`'].join('\n'),
    );
    expect(s.description).toBe('Explicit');
  });

  it('rejects a sheet with no content at all', () => {
    expect(() => parseSheet(sheet('Only prose here.'), 'empty.md')).toThrow(
      /no commands, fenced blocks, or colour rows/,
    );
  });
});
