import { describe, expect, it } from 'vitest';
import { generateWebfilter, type WebfilterOptions } from '../src/lib/webfilter';

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

/** [input fixture, expected fixture, options passed to generateWebfilter] */
const parityCases: [string, string, WebfilterOptions][] = [
  ['webfilter-basic.txt', 'webfilter-basic.default.expected.txt', {}],
  [
    'webfilter-basic.txt',
    'webfilter-basic.exempt-disable.expected.txt',
    { action: 'exempt', status: 'disable' },
  ],
  ['webfilter-basic.txt', 'webfilter-basic.nosort.expected.txt', { sort: false }],
  ['webfilter-basic.txt', 'webfilter-basic.nodedupe.expected.txt', { dedupe: false }],
  [
    'webfilter-basic.txt',
    'webfilter-basic.nosort-nodedupe.expected.txt',
    { sort: false, dedupe: false },
  ],
  ['webfilter-quotes.txt', 'webfilter-quotes.default.expected.txt', {}],
  ['webfilter-quotes.txt', 'webfilter-quotes.exempt.expected.txt', { action: 'exempt' }],
  [
    'webfilter-quotes.txt',
    'webfilter-quotes.nosort-nodedupe.expected.txt',
    { sort: false, dedupe: false },
  ],
  ['webfilter-empty.txt', 'webfilter-empty.default.expected.txt', {}],
  ['webfilter-order.txt', 'webfilter-order.default.expected.txt', {}],
  ['webfilter-order.txt', 'webfilter-order.nosort.expected.txt', { sort: false }],
  ['webfilter-order.txt', 'webfilter-order.nodedupe.expected.txt', { dedupe: false }],
];

describe('generateWebfilter parity with webfilter-generator.py', () => {
  it.each(parityCases)('%s -> %s with %o', (inputName, expectedName, options) => {
    const input = fixture(inputName);
    const expected = fixture(expectedName);
    const { output } = generateWebfilter(input, options);
    expect(output).toBe(expected);
  });
});

describe('generateWebfilter unit behavior', () => {
  it('defaults: enable status, block action (no action line), dedupe + sort on', () => {
    const { output } = generateWebfilter('b.example\na.example\nA.EXAMPLE\n');
    expect(output).toBe(
      'edit "a.example"\nset status enable\nnext\nedit "b.example"\nset status enable\nnext\n',
    );
  });

  it('emits set action exempt only for action=exempt', () => {
    const block = generateWebfilter('x.example', { action: 'block' });
    const exempt = generateWebfilter('x.example', { action: 'exempt' });
    expect(block.output).not.toContain('set action');
    expect(exempt.output).toBe('edit "x.example"\nset status enable\nset action exempt\nnext\n');
  });

  it('returns empty output (no trailing newline) for empty/comment-only input', () => {
    expect(generateWebfilter('').output).toBe('');
    expect(generateWebfilter('# comment\n\n   \n').output).toBe('');
  });

  it('output ends with exactly one trailing newline when non-empty', () => {
    const { output } = generateWebfilter('a.example');
    expect(output.endsWith('next\n')).toBe(true);
    expect(output.endsWith('\n\n')).toBe(false);
  });

  it('strips one pair of matching quotes and escapes embedded double quotes', () => {
    const { output } = generateWebfilter('"a"b.example"', { sort: false });
    // Outer matching quotes stripped first, inner quote escaped.
    expect(output).toBe('edit "a\\"b.example"\nset status enable\nnext\n');
  });

  it('keeps a lone quote character as an empty entry, like the Python', () => {
    const { output, stats } = generateWebfilter('"', {});
    expect(output).toBe('edit ""\nset status enable\nnext\n');
    expect(stats.domains).toBe(1);
  });

  it('dedupes case-insensitively keeping the first occurrence', () => {
    const { output, stats } = generateWebfilter('Foo.Example\nfoo.example\nFOO.EXAMPLE\n', {
      sort: false,
    });
    expect(output).toBe('edit "Foo.Example"\nset status enable\nnext\n');
    expect(stats.domains).toBe(1);
    expect(stats.duplicatesRemoved).toBe(2);
  });

  it('sort is stable and case-insensitive', () => {
    const { output } = generateWebfilter('B.example\na.example\nb.EXAMPLE\n', { dedupe: false });
    const names = [...output.matchAll(/^edit "(.*)"$/gm)].map((m) => m[1]);
    expect(names).toEqual(['a.example', 'B.example', 'b.EXAMPLE']);
  });

  it('never rejects non-domain lines but warns about them', () => {
    const { output, warnings } = generateWebfilter('good.example\nnot a domain\n', { sort: false });
    expect(output).toContain('edit "not a domain"');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toBe(2);
    expect(warnings[0].message).toContain('not a domain');
  });

  it('counts stats correctly', () => {
    const { stats } = generateWebfilter('a.example\nA.example\nb.example\n# c\n\n');
    expect(stats).toEqual({ domains: 2, duplicatesRemoved: 1, wildcardEntries: 0 });
  });

  it('handles \\r\\n line endings like Python splitlines', () => {
    const { output } = generateWebfilter('a.example\r\nb.example\r\n');
    expect(output).toBe(
      'edit "a.example"\nset status enable\nnext\nedit "b.example"\nset status enable\nnext\n',
    );
  });
});

describe('generateWebfilter static URL filter options', () => {
  it('emits set type in bare format', () => {
    const { output } = generateWebfilter('facebook.com', { type: 'wildcard' });
    expect(output).toBe('edit "facebook.com"\nset status enable\nset type wildcard\nnext\n');
  });

  it('leaves output unchanged when no new options are set', () => {
    const before = generateWebfilter('a.example\nb.example\n').output;
    const after = generateWebfilter('a.example\nb.example\n', { format: 'bare' }).output;
    expect(after).toBe(before);
  });

  it('applies the * wildcard prefix only for wildcard type', () => {
    const wild = generateWebfilter('facebook.com', { type: 'wildcard', wildcardPrefix: '*' });
    expect(wild.output).toContain('edit "*facebook.com"');
    const simple = generateWebfilter('facebook.com', { type: 'simple', wildcardPrefix: '*' });
    expect(simple.output).toContain('edit "facebook.com"');
  });

  it('applies the *. wildcard prefix', () => {
    const { output } = generateWebfilter('facebook.com', {
      type: 'wildcard',
      wildcardPrefix: '*.',
    });
    expect(output).toContain('edit "*.facebook.com"');
  });

  it('does not prefix domains that already contain a *', () => {
    const { output } = generateWebfilter('*facebook.com\n*.twitter.com\nfoo*.example\n', {
      type: 'wildcard',
      wildcardPrefix: '*',
      sort: false,
    });
    expect(output).toContain('edit "*facebook.com"');
    expect(output).toContain('edit "*.twitter.com"');
    // A mid-string wildcard is already a pattern; prefixing would change it.
    expect(output).toContain('edit "foo*.example"');
    expect(output).not.toContain('**');
  });

  it('suppresses the domain-shape warning for wildcard and regex types', () => {
    expect(generateWebfilter('*facebook.com', { type: 'wildcard' }).warnings).toHaveLength(0);
    expect(generateWebfilter('.*\\.example\\.com', { type: 'regex' }).warnings).toHaveLength(0);
    expect(generateWebfilter('*facebook.com', { type: 'simple' }).warnings).toHaveLength(1);
  });

  it('omits the status line when status is omit', () => {
    const { output } = generateWebfilter('facebook.com', { status: 'omit' });
    expect(output).toBe('edit "facebook.com"\nnext\n');
  });

  it('supports allow and monitor actions', () => {
    expect(generateWebfilter('a.example', { action: 'allow' }).output).toContain(
      'set action allow',
    );
    expect(generateWebfilter('a.example', { action: 'monitor' }).output).toContain(
      'set action monitor',
    );
  });

  it('entries format numbers the entries and moves the URL to set url', () => {
    const { output } = generateWebfilter('facebook.com\ntwitter.com\n', {
      format: 'entries',
      type: 'wildcard',
      wildcardPrefix: '*',
      status: 'omit',
    });
    expect(output).toBe(
      'edit 1\nset url "*facebook.com"\nset type wildcard\nset action block\nnext\n' +
        'edit 2\nset url "*twitter.com"\nset type wildcard\nset action block\nnext\n',
    );
  });

  it('entries format always emits set action block, unlike bare format', () => {
    expect(generateWebfilter('a.example', { format: 'bare' }).output).not.toContain('set action');
    expect(generateWebfilter('a.example', { format: 'entries' }).output).toContain(
      'set action block',
    );
  });

  it('entries format honours startId', () => {
    const { output } = generateWebfilter('a.example\nb.example\n', {
      format: 'entries',
      startId: 10,
    });
    expect(output).toContain('edit 10');
    expect(output).toContain('edit 11');
  });

  it('full format matches the FortiOS documentation example', () => {
    const { output } = generateWebfilter('facebook.com', {
      format: 'full',
      type: 'wildcard',
      wildcardPrefix: '*',
      action: 'block',
      status: 'omit',
      listId: 1,
      listName: 'webfilter',
    });
    expect(output).toBe(
      [
        'config webfilter urlfilter',
        '    edit 1',
        '        set name "webfilter"',
        '        config entries',
        '            edit 1',
        '                set url "*facebook.com"',
        '                set type wildcard',
        '                set action block',
        '            next',
        '        end',
        '    next',
        'end',
        '',
      ].join('\n'),
    );
  });

  it('full format includes a comment only when set', () => {
    const withComment = generateWebfilter('a.example', {
      format: 'full',
      comment: 'blocked sites',
    });
    expect(withComment.output).toContain('        set comment "blocked sites"');
    const without = generateWebfilter('a.example', { format: 'full' });
    expect(without.output).not.toContain('set comment');
  });

  it('escapes double quotes in the list name and comment', () => {
    const { output } = generateWebfilter('a.example', {
      format: 'full',
      listName: 'my"list',
      comment: 'a"b',
    });
    expect(output).toContain('set name "my\\"list"');
    expect(output).toContain('set comment "a\\"b"');
  });

  it('emits nothing for empty input in every format', () => {
    for (const format of ['bare', 'entries', 'full'] as const) {
      expect(generateWebfilter('# only a comment\n', { format }).output).toBe('');
    }
  });
});

describe('generateWebfilter auto type detection', () => {
  it('marks domains containing * as wildcard and the rest as simple', () => {
    const { output } = generateWebfilter('example.com\n*facebook.com\n', {
      type: 'auto',
      sort: false,
    });
    expect(output).toBe(
      'edit "example.com"\nset status enable\nset type simple\nnext\n' +
        'edit "*facebook.com"\nset status enable\nset type wildcard\nnext\n',
    );
  });

  it('detects a * anywhere in the domain, not just at the start', () => {
    const { output } = generateWebfilter('foo*.example\nbar.example*\n', {
      type: 'auto',
      sort: false,
    });
    expect(output.match(/set type wildcard/g)).toHaveLength(2);
    expect(output).not.toContain('set type simple');
  });

  it('resolves per entry in entries and full formats too', () => {
    const { output } = generateWebfilter('example.com\n*facebook.com\n', {
      type: 'auto',
      format: 'entries',
      status: 'omit',
      sort: false,
    });
    expect(output).toBe(
      'edit 1\nset url "example.com"\nset type simple\nset action block\nnext\n' +
        'edit 2\nset url "*facebook.com"\nset type wildcard\nset action block\nnext\n',
    );
  });

  it('warns about non-domain entries only when they are not wildcards', () => {
    const { warnings } = generateWebfilter('*facebook.com\nnot a domain\n', {
      type: 'auto',
      sort: false,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('not a domain');
  });

  it('counts wildcard entries in stats', () => {
    const auto = generateWebfilter('a.example\n*b.example\n*c.example\n', { type: 'auto' });
    expect(auto.stats.wildcardEntries).toBe(2);
    expect(auto.stats.domains).toBe(3);
    // An explicit type still reports what was actually emitted.
    expect(generateWebfilter('a.example', { type: 'simple' }).stats.wildcardEntries).toBe(0);
    expect(generateWebfilter('a.example', { type: 'wildcard' }).stats.wildcardEntries).toBe(1);
  });

  it('does not apply the wildcard prefix under auto', () => {
    const { output } = generateWebfilter('example.com', { type: 'auto', wildcardPrefix: '*' });
    expect(output).toContain('edit "example.com"');
    expect(output).toContain('set type simple');
  });

  it('allows include-subdomains under auto, since simple entries may remain', () => {
    const { warnings } = generateWebfilter('a.example', {
      type: 'auto',
      format: 'full',
      includeSubdomains: false,
    });
    expect(warnings).toHaveLength(0);
  });
});

describe('generateWebfilter set exempt', () => {
  it('emits selected flags in the documented order, not click order', () => {
    const { output } = generateWebfilter('a.example', {
      action: 'exempt',
      exempt: ['dlp', 'av', 'fortiguard'],
    });
    expect(output).toContain('set exempt av dlp fortiguard');
  });

  it('emits all on its own when all is selected', () => {
    const { output } = generateWebfilter('a.example', {
      action: 'exempt',
      exempt: ['av', 'all', 'dlp'],
    });
    expect(output).toContain('set exempt all');
    expect(output).not.toContain('set exempt av');
  });

  it('is ignored, with a warning, when the action is not exempt', () => {
    const { output, warnings } = generateWebfilter('a.example', {
      action: 'block',
      exempt: ['av'],
    });
    expect(output).not.toContain('set exempt');
    expect(warnings.map((w) => w.message)).toContain(
      'set exempt is only used when the action is exempt — ignored',
    );
  });

  it('emits nothing when no flags are selected', () => {
    const { output } = generateWebfilter('a.example', { action: 'exempt', exempt: [] });
    expect(output).not.toContain('set exempt');
    expect(output).toContain('set action exempt');
  });

  it('appears after set action in entries format', () => {
    const { output } = generateWebfilter('a.example', {
      format: 'entries',
      action: 'exempt',
      exempt: ['antiphish'],
      status: 'omit',
    });
    expect(output).toBe(
      'edit 1\nset url "a.example"\nset action exempt\nset exempt antiphish\nnext\n',
    );
  });
});

describe('generateWebfilter list-level options', () => {
  it('emits set include-subdomains in full format', () => {
    const on = generateWebfilter('a.example', { format: 'full', includeSubdomains: true });
    expect(on.output).toContain('        set include-subdomains enable');
    const off = generateWebfilter('a.example', { format: 'full', includeSubdomains: false });
    expect(off.output).toContain('        set include-subdomains disable');
    const omitted = generateWebfilter('a.example', { format: 'full' });
    expect(omitted.output).not.toContain('include-subdomains');
  });

  it('warns when include-subdomains is combined with a non-simple type', () => {
    const { warnings } = generateWebfilter('a.example', {
      format: 'full',
      type: 'wildcard',
      includeSubdomains: false,
    });
    expect(warnings.map((w) => w.message)).toContain(
      'set include-subdomains only applies to simple type entries, not wildcard',
    );
    expect(
      generateWebfilter('a.example', { format: 'full', type: 'simple', includeSubdomains: false })
        .warnings,
    ).toHaveLength(0);
  });

  it('appends a profile binding that references the list ID', () => {
    const { output } = generateWebfilter('facebook.com', {
      format: 'full',
      type: 'wildcard',
      wildcardPrefix: '*',
      status: 'omit',
      listId: 7,
      bindProfile: true,
      profileName: 'corp-wf',
    });
    expect(output).toBe(
      [
        'config webfilter urlfilter',
        '    edit 7',
        '        set name "webfilter"',
        '        config entries',
        '            edit 1',
        '                set url "*facebook.com"',
        '                set type wildcard',
        '                set action block',
        '            next',
        '        end',
        '    next',
        'end',
        '',
        'config webfilter profile',
        '    edit "corp-wf"',
        '        config web',
        '            set urlfilter-table 7',
        '        end',
        '    next',
        'end',
        '',
      ].join('\n'),
    );
  });

  it('does not bind the profile in bare or entries formats', () => {
    for (const format of ['bare', 'entries'] as const) {
      const { output } = generateWebfilter('a.example', { format, bindProfile: true });
      expect(output).not.toContain('config webfilter profile');
    }
  });
});
