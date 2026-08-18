import { describe, expect, it } from 'vitest';
import { generateWebContent, MAX_WILDCARD_PATTERN } from '../src/lib/webfilter-content';

describe('generateWebContent', () => {
  it('matches the FortiOS documentation example', () => {
    const { output } = generateWebContent('fortinet', {
      patternType: 'regexp',
      status: 'enable',
      lang: 'western',
      score: 10,
      action: 'block',
      listId: 1,
      listName: 'webfilter',
    });
    expect(output).toBe(
      [
        'config webfilter content',
        '    edit 1',
        '        set name "webfilter"',
        '        config entries',
        '            edit "fortinet"',
        '                set pattern-type regexp',
        '                set status enable',
        '                set lang western',
        '                set score 10',
        '                set action block',
        '            next',
        '        end',
        '    next',
        'end',
        '',
      ].join('\n'),
    );
  });

  it('emits entry bodies only in entries format', () => {
    const { output } = generateWebContent('gambling', { format: 'entries' });
    expect(output).toBe(
      'edit "gambling"\nset pattern-type wildcard\nset status enable\n' +
        'set lang western\nset score 10\nset action block\nnext\n',
    );
  });

  it('appends a profile binding with the threshold and table ID', () => {
    const { output } = generateWebContent('gambling', {
      bindProfile: true,
      profileName: 'corp-wf',
      listId: 3,
      threshold: 20,
    });
    expect(output).toContain(
      [
        'config webfilter profile',
        '    edit "corp-wf"',
        '        config web',
        '            set bword-threshold 20',
        '            set bword-table 3',
        '        end',
        '    next',
        'end',
      ].join('\n'),
    );
  });

  it('does not bind a profile in entries format', () => {
    const { output } = generateWebContent('gambling', { format: 'entries', bindProfile: true });
    expect(output).not.toContain('config webfilter profile');
  });

  it('keeps surrounding quotes, since a quoted phrase matches exactly', () => {
    const { output } = generateWebContent('"free money"', { format: 'entries' });
    expect(output).toContain('edit "\\"free money\\""');
  });

  it('escapes embedded double quotes in the pattern, list name, and comment', () => {
    const { output } = generateWebContent('say "hi" now', {
      listName: 'my"list',
      comment: 'a"b',
    });
    expect(output).toContain('edit "say \\"hi\\" now"');
    expect(output).toContain('set name "my\\"list"');
    expect(output).toContain('set comment "a\\"b"');
  });

  it('includes a comment only when set', () => {
    expect(generateWebContent('a', { comment: 'banned words' }).output).toContain(
      '        set comment "banned words"',
    );
    expect(generateWebContent('a').output).not.toContain('set comment');
  });

  it('omits the status line when status is omit', () => {
    const { output } = generateWebContent('a', { format: 'entries', status: 'omit' });
    expect(output).not.toContain('set status');
    expect(output).toContain('set pattern-type wildcard');
  });

  it('skips blank lines and # comments', () => {
    const { output, stats } = generateWebContent('# note\n\n  \ngambling\n', {
      format: 'entries',
    });
    expect(stats.patterns).toBe(1);
    expect(output).toContain('edit "gambling"');
  });

  it('dedupes case-insensitively and sorts case-insensitively', () => {
    const { output, stats } = generateWebContent('Beta\nalpha\nBETA\n', { format: 'entries' });
    const names = [...output.matchAll(/^edit "(.*)"$/gm)].map((m) => m[1]);
    expect(names).toEqual(['alpha', 'Beta']);
    expect(stats.duplicatesRemoved).toBe(1);
  });

  it('preserves input order when sort is off', () => {
    const { output } = generateWebContent('zeta\nalpha\n', { format: 'entries', sort: false });
    const names = [...output.matchAll(/^edit "(.*)"$/gm)].map((m) => m[1]);
    expect(names).toEqual(['zeta', 'alpha']);
  });

  it('emits nothing for empty or comment-only input', () => {
    expect(generateWebContent('').output).toBe('');
    expect(generateWebContent('# only a comment\n').output).toBe('');
  });

  it('supports every documented language and both pattern types', () => {
    expect(generateWebContent('a', { lang: 'trach' }).output).toContain('set lang trach');
    expect(generateWebContent('a', { lang: 'cyrillic' }).output).toContain('set lang cyrillic');
    expect(generateWebContent('a', { patternType: 'regexp' }).output).toContain(
      'set pattern-type regexp',
    );
    expect(generateWebContent('a', { action: 'exempt' }).output).toContain('set action exempt');
  });
});

describe('generateWebContent warnings and stats', () => {
  it('warns when a wildcard pattern exceeds the documented length', () => {
    const long = 'a'.repeat(MAX_WILDCARD_PATTERN + 1);
    const { warnings } = generateWebContent(long, { patternType: 'wildcard' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toBe(1);
    expect(warnings[0].message).toContain('81 characters');
    // The limit is documented for wildcard patterns.
    expect(generateWebContent(long, { patternType: 'regexp' }).warnings).toHaveLength(0);
  });

  it('warns about an unbalanced quote', () => {
    const { warnings } = generateWebContent('"free money', {});
    expect(warnings[0].message).toContain('unbalanced quote');
    expect(generateWebContent('"free money"', {}).warnings).toHaveLength(0);
  });

  it('warns about a score that can never reach the threshold', () => {
    const { warnings } = generateWebContent('a', { score: 0 });
    expect(warnings.map((w) => w.message)).toContain(
      'a score of 0 never reaches the threshold, so these patterns cannot block a page',
    );
  });

  it('warns about non-integer or negative scores and thresholds', () => {
    expect(generateWebContent('a', { score: 2.5 }).warnings[0].message).toContain(
      'is not a non-negative whole number',
    );
    expect(
      generateWebContent('a', { threshold: -1, bindProfile: true }).warnings.some((w) =>
        w.message.includes('threshold -1'),
      ),
    ).toBe(true);
  });

  it('reports how many matches are needed to block a page', () => {
    expect(generateWebContent('a', { score: 10, threshold: 10 }).stats.patternsToBlock).toBe(1);
    expect(generateWebContent('a', { score: 5, threshold: 20 }).stats.patternsToBlock).toBe(4);
    // Rounds up: three matches at 4 points clear a threshold of 10.
    expect(generateWebContent('a', { score: 4, threshold: 10 }).stats.patternsToBlock).toBe(3);
    expect(generateWebContent('a', { score: 0 }).stats.patternsToBlock).toBe(0);
  });

  it('counts patterns and duplicates', () => {
    const { stats } = generateWebContent('a\nA\nb\n# c\n\n');
    expect(stats.patterns).toBe(2);
    expect(stats.duplicatesRemoved).toBe(1);
  });

  it('handles \\r\\n line endings', () => {
    const { stats } = generateWebContent('a\r\nb\r\n');
    expect(stats.patterns).toBe(2);
  });
});
