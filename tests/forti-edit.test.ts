import { describe, expect, it } from 'vitest';
import {
  applyRules,
  doAppend,
  doSet,
  dryRunFortiEdit,
  emitDelta,
  entries,
  findBlock,
  getSetting,
  matches,
  parse,
  parseRulesJson,
  q,
  runFortiEdit,
  serializeRulesJson,
  tokenize,
  unq,
  type Entry,
  type OutputMode,
  type Rule,
  type RulesFile,
} from '../src/lib/forti-edit';

// @types/node is not installed in this project, so access node:fs through
// process.getBuiltinModule (Node >= 20.16) with a minimal local declaration —
// keeps `tsc --noEmit` clean without adding dependencies.
declare const process: {
  getBuiltinModule(name: 'node:fs'): {
    readFileSync(path: URL, encoding: 'utf-8'): string;
  };
};
const fs = process.getBuiltinModule('node:fs');

function fixture(name: string): string {
  return fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8');
}

const SAMPLE = () => fixture('forti-edit-sample.input.txt');

/** [name, expected fixture, section, rules, mode] — expected = Python stdout. */
const parityCases: [string, string, string, Rule[], OutputMode][] = [
  [
    'contains + append, delta',
    'forti-edit-append.delta.expected.txt',
    'firewall policy',
    [{ where: [['srcintf', 'contains', 'x1']], append: [['srcintf', 'x2']] }],
    'delta',
  ],
  [
    'contains + append, full',
    'forti-edit-append.full.expected.txt',
    'firewall policy',
    [{ where: [['srcintf', 'contains', 'x1']], append: [['srcintf', 'x2']] }],
    'full',
  ],
  [
    'equals + set (multi-value)',
    'forti-edit-set.delta.expected.txt',
    'firewall policy',
    [{ where: [['action', 'equals', 'deny']], set: [['service', ['DNS', 'HTTP']]] }],
    'delta',
  ],
  [
    'remove (no where = all entries)',
    'forti-edit-remove.delta.expected.txt',
    'firewall policy',
    [{ where: [], remove: [['srcintf', 'dmz']] }],
    'delta',
  ],
  [
    'no match emits nothing',
    'forti-edit-nomatch.delta.expected.txt',
    'firewall policy',
    [{ where: [['srcintf', 'contains', 'nope']], append: [['srcintf', 'x2']] }],
    'delta',
  ],
  [
    'exists op',
    'forti-edit-exists.delta.expected.txt',
    'firewall policy',
    [{ where: [['nat', 'exists', '_']], append: [['srcintf', 'wan-backup']] }],
    'delta',
  ],
  [
    'absent + equals ops',
    'forti-edit-absent.delta.expected.txt',
    'firewall policy',
    [
      {
        where: [
          ['nat', 'absent', '_'],
          ['action', 'equals', 'accept'],
        ],
        append: [['nat', 'disable']],
      },
    ],
    'delta',
  ],
  [
    'second section, full, nested config in entry',
    'forti-edit-sysintf.full.expected.txt',
    'system interface',
    [{ where: [['vdom', 'contains', 'root']], append: [['allowaccess', 'http']] }],
    'full',
  ],
];

describe('runFortiEdit parity with forti-edit.py', () => {
  it.each(parityCases)('%s', (_name, expectedName, section, rules, mode) => {
    const expected = fixture(expectedName);
    const result = runFortiEdit(SAMPLE(), section, rules, mode);
    expect(result.error).toBeUndefined();
    expect(result.output).toBe(expected);
  });

  it('multi-rule batch from a rules JSON file (add-x2 semantics)', () => {
    const parsed = parseRulesJson(fixture('forti-edit-rules-x2.json'));
    expect(parsed.error).toBeUndefined();
    const file = parsed.file as RulesFile;
    expect(file.section).toBe('firewall policy');
    const result = runFortiEdit(SAMPLE(), file.section as string, file.rules, 'delta');
    expect(result.output).toBe(fixture('forti-edit-rules.delta.expected.txt'));
    // Entry 30 was touched by both rules but appears once, with both fields.
    expect(result.changed).toEqual([
      { key: '1', name: 'Allow-Out', fields: ['srcintf'] },
      { key: '30', name: 'Branch VPN', fields: ['srcintf', 'dstintf'] },
    ]);
  });

  it('reports structured change data and summary (was stderr)', () => {
    const result = runFortiEdit(
      SAMPLE(),
      'firewall policy',
      [{ where: [['srcintf', 'contains', 'x1']], append: [['srcintf', 'x2']] }],
      'delta',
    );
    expect(result.changed).toEqual([
      { key: '1', name: 'Allow-Out', fields: ['srcintf'] },
      { key: '30', name: 'Branch VPN', fields: ['srcintf'] },
    ]);
    expect(result.summary).toBe("Changed 2 entries in 'firewall policy'");
  });

  it('no-match run reports nothing to do', () => {
    const result = runFortiEdit(
      SAMPLE(),
      'firewall policy',
      [{ where: [['srcintf', 'contains', 'nope']], append: [['srcintf', 'x2']] }],
      'delta',
    );
    expect(result.output).toBe('');
    expect(result.changed).toEqual([]);
    expect(result.summary).toBe(
      "Changed 0 entries in 'firewall policy'; nothing to do, no config emitted",
    );
  });

  it('missing section is a structured error, not a throw', () => {
    const result = runFortiEdit('config firewall policy\nend\n', 'router static', [], 'delta');
    expect(result.error).toBe("section 'router static' not found in input");
    expect(result.output).toBe('');
  });
});

describe('tokenize / unq / q', () => {
  it('preserves quotes on tokens and splits on spaces and tabs', () => {
    expect(tokenize('set srcintf "x1" "dmz"')).toEqual(['set', 'srcintf', '"x1"', '"dmz"']);
    expect(tokenize('a\tb  c')).toEqual(['a', 'b', 'c']);
    expect(tokenize('  \t ')).toEqual([]);
    expect(tokenize('')).toEqual([]);
  });

  it('keeps spaces inside quoted tokens (no escape handling)', () => {
    expect(tokenize('set name "Deny Guests"')).toEqual(['set', 'name', '"Deny Guests"']);
  });

  it('runs an unterminated quote to end of line, like the Python', () => {
    expect(tokenize('set name "abc')).toEqual(['set', 'name', '"abc']);
    // unq only strips a *matched* pair
    expect(unq('"abc')).toBe('"abc');
  });

  it('unq strips exactly one matched pair of quotes', () => {
    expect(unq('"x1"')).toBe('x1');
    expect(unq('x1')).toBe('x1');
    expect(unq('"')).toBe('"');
    expect(unq('""')).toBe('');
  });

  it('q wraps bare values, leaves quoted values alone', () => {
    expect(q('x2')).toBe('"x2"');
    expect(q('"x2"')).toBe('"x2"');
    expect(q('')).toBe('""');
  });
});

describe('parser', () => {
  it('reconstructs pager-wrapped lines by raw concatenation', () => {
    const root = parse(
      [
        'config firewall policy',
        '    edit 1',
        '        set dstaddr "srv-a" "very-long-na',
        'me-wrapped" "srv-b"',
        '    next',
        'end',
      ].join('\n'),
    );
    const block = findBlock(root, 'firewall policy');
    expect(block).not.toBeNull();
    const entry = entries(block!)[0];
    expect(getSetting(entry, 'dstaddr')!.values).toEqual([
      '"srv-a"',
      '"very-long-name-wrapped"',
      '"srv-b"',
    ]);
  });

  it('drops noise lines outside a set/unset continuation context', () => {
    const root = parse(
      [
        'FGT # show firewall policy', // noise at root: dropped
        'banner line', // noise at root: dropped
        'config firewall policy',
        '    edit 1',
        'stray-noise-after-edit', // pending logical is "edit 1": dropped
        '        set action accept',
        '    next',
        'end',
        'trailing prompt noise', // pending logical is "end": dropped
      ].join('\n'),
    );
    const block = findBlock(root, 'firewall policy')!;
    const entry = entries(block)[0];
    expect(entry.key).toBe('1');
    expect(entry.children).toEqual([{ kind: 'setting', name: 'action', values: ['accept'] }]);
  });

  it('skips blank lines and strips \\r', () => {
    const root = parse('config firewall policy\r\n\r\n    edit 1\r\n    next\r\nend\r\n');
    const block = findBlock(root, 'firewall policy')!;
    expect(entries(block).map((e) => e.key)).toEqual(['1']);
  });

  it('parses nested config blocks inside entries and unset lines', () => {
    const root = parse(SAMPLE());
    const block = findBlock(root, 'firewall policy')!;
    const e30 = entries(block).find((e) => e.key === '30')!;
    expect(e30.children.some((c) => c.kind === 'unset' && c.name === 'status')).toBe(true);
    const nested = e30.children.find((c) => c.kind === 'config');
    expect(nested).toBeDefined();
    expect(nested!.kind === 'config' && nested!.path).toBe('replacemsg-override-group');
  });

  it('unquotes multi-token config paths', () => {
    const root = parse('config firewall "policy"\nend\n');
    expect(findBlock(root, 'firewall policy')).not.toBeNull();
  });
});

describe('matching', () => {
  const entry = (): Entry => {
    const root = parse(
      'config t\n    edit 1\n        set f "a" "b"\n        set single "x"\n    next\nend\n',
    );
    return entries(findBlock(root, 't')!)[0];
  };

  it('contains matches literal tokens, never substrings', () => {
    expect(matches(entry(), [['f', 'contains', 'a']])).toBe(true);
    expect(matches(entry(), [['f', 'contains', '"b"']])).toBe(true);
    // 'a' is a substring of nothing here, but a partial token must not match
    expect(matches(entry(), [['f', 'contains', 'ab']])).toBe(false);
  });

  it('equals means the value list is exactly [value]', () => {
    expect(matches(entry(), [['single', 'equals', 'x']])).toBe(true);
    expect(matches(entry(), [['f', 'equals', 'a']])).toBe(false); // multi-value
    expect(matches(entry(), [['missing', 'equals', 'x']])).toBe(false);
  });

  it('exists / absent / not-contains', () => {
    expect(matches(entry(), [['f', 'exists', '_']])).toBe(true);
    expect(matches(entry(), [['missing', 'exists', '_']])).toBe(false);
    expect(matches(entry(), [['missing', 'absent', '_']])).toBe(true);
    expect(matches(entry(), [['f', 'not-contains', 'z']])).toBe(true);
    expect(matches(entry(), [['f', 'not-contains', 'a']])).toBe(false);
  });

  it('conditions are AND-ed', () => {
    expect(
      matches(entry(), [
        ['f', 'contains', 'a'],
        ['single', 'equals', 'x'],
      ]),
    ).toBe(true);
    expect(
      matches(entry(), [
        ['f', 'contains', 'a'],
        ['single', 'equals', 'y'],
      ]),
    ).toBe(false);
  });

  it('throws on an unknown op (matches the Python ValueError)', () => {
    expect(() => matches(entry(), [['f', 'bogus', 'a']])).toThrow('unknown match op: bogus');
  });
});

describe('mutations', () => {
  const freshEntry = (): Entry => {
    const root = parse('config t\n    edit 1\n        set f "a" "b"\n    next\nend\n');
    return entries(findBlock(root, 't')!)[0];
  };

  it('append is idempotent and quote-insensitive', () => {
    const e = freshEntry();
    expect(doAppend(e, 'f', 'c')).toBe(true);
    expect(getSetting(e, 'f')!.values).toEqual(['"a"', '"b"', '"c"']);
    expect(doAppend(e, 'f', 'c')).toBe(false); // already there
    expect(doAppend(e, 'f', '"c"')).toBe(false); // quoted form of same token
    expect(getSetting(e, 'f')!.values).toEqual(['"a"', '"b"', '"c"']);
    expect(e.changedFields).toEqual(['f']);
  });

  it('append creates the setting when absent', () => {
    const e = freshEntry();
    expect(doAppend(e, 'nat', 'disable')).toBe(true);
    expect(getSetting(e, 'nat')!.values).toEqual(['"disable"']);
  });

  it('set is a no-op when values already match after quoting', () => {
    const e = freshEntry();
    expect(doSet(e, 'f', ['a', 'b'])).toBe(false); // '"a" "b"' already
    expect(doSet(e, 'f', ['b', 'a'])).toBe(true); // order matters
    expect(getSetting(e, 'f')!.values).toEqual(['"b"', '"a"']);
  });

  it('applyRules resets changedFields and collects entries in first-touch order', () => {
    const root = parse(SAMPLE());
    const block = findBlock(root, 'firewall policy')!;
    const rules: Rule[] = [{ where: [['srcintf', 'contains', 'x1']], append: [['srcintf', 'x2']] }];
    const first = applyRules(block, rules);
    expect(first.map((e) => e.key)).toEqual(['1', '30']);
    // Second run over the mutated tree: append is idempotent, nothing changes,
    // and the previous run's changedFields are reset.
    const second = applyRules(block, rules);
    expect(second).toEqual([]);
    for (const e of entries(block)) expect(e.changedFields).toEqual([]);
  });

  it('emitDelta emits unset for a changed field whose setting no longer exists', () => {
    const root = parse('config t\n    edit 1\n    next\nend\n');
    const block = findBlock(root, 't')!;
    const e = entries(block)[0];
    e.changedFields.push('gone', 'gone'); // dedupe check too
    expect(emitDelta(block, [e])).toBe('config t\n    edit 1\n        unset gone\n    next\nend');
  });
});

describe('rules JSON', () => {
  it('round-trips through serialize + parse', () => {
    const file: RulesFile = {
      section: 'firewall policy',
      rules: [
        { where: [['srcintf', 'contains', 'x1']], append: [['srcintf', 'x2']] },
        {
          where: [['action', 'equals', 'deny']],
          remove: [['srcintf', 'dmz']],
          set: [['service', ['DNS', 'HTTP']]],
        },
      ],
    };
    const parsed = parseRulesJson(serializeRulesJson(file));
    expect(parsed.error).toBeUndefined();
    expect(parsed.file).toEqual(file);
  });

  it('accepts the add-x2.json shape', () => {
    const parsed = parseRulesJson(fixture('forti-edit-rules-x2.json'));
    expect(parsed.error).toBeUndefined();
    expect(parsed.file!.rules).toHaveLength(2);
    expect(parsed.file!.rules[0]).toEqual({
      where: [['srcintf', 'contains', 'x1']],
      append: [['srcintf', 'x2']],
    });
  });

  it('rejects malformed documents with clear errors', () => {
    expect(parseRulesJson('not json').error).toMatch(/invalid JSON/);
    expect(parseRulesJson('[]').error).toBe('rules file must be a JSON object');
    expect(parseRulesJson('{}').error).toBe('rules file must have a "rules" array');
    expect(parseRulesJson('{"rules":[{"where":[["a","b"]]}]}').error).toMatch(/rule 1/);
    expect(parseRulesJson('{"rules":[{"set":[["f","notarray"]]}]}').error).toMatch(/rule 1/);
    expect(parseRulesJson('{"section":5,"rules":[]}').error).toBe('"section" must be a string');
  });
});

describe('dryRunFortiEdit', () => {
  it('reports per-rule matches without mutating anything', () => {
    const rules: Rule[] = [
      { where: [['srcintf', 'contains', 'x1']] },
      { where: [] }, // matches all
    ];
    const result = dryRunFortiEdit(SAMPLE(), 'firewall policy', rules);
    expect(result.error).toBeUndefined();
    expect(result.matches![0].entries).toEqual([
      { key: '1', name: 'Allow-Out' },
      { key: '30', name: 'Branch VPN' },
    ]);
    expect(result.matches![1].entries.map((e) => e.key)).toEqual(['1', '2', '30', '41']);
  });

  it('an "any" interface policy does not match contains x1', () => {
    const result = dryRunFortiEdit(SAMPLE(), 'firewall policy', [
      { where: [['srcintf', 'contains', 'x1']] },
    ]);
    expect(result.matches![0].entries.map((e) => e.key)).not.toContain('2');
  });

  it('surfaces a missing section as an error string', () => {
    const result = dryRunFortiEdit('config a b\nend\n', 'nope', []);
    expect(result.error).toBe("section 'nope' not found in input");
  });
});
