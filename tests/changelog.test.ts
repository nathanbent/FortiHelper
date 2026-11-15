import { describe, expect, it } from 'vitest';
import { changelog, parseChangelog } from '../src/lib/changelog';

describe('parseChangelog', () => {
  it('reads headings and their bullets, ignoring the preamble', () => {
    const entries = parseChangelog(
      ['# Changelog', '', 'Intro text.', '- not an entry yet', '', '## 2026-02-01', '', '- One', '- Two', '', '## 2026-01-01', '- Three'].join('\n'),
    );
    expect(entries).toEqual([
      { title: '2026-02-01', items: ['One', 'Two'] },
      { title: '2026-01-01', items: ['Three'] },
    ]);
  });

  it('joins a bullet wrapped onto indented lines', () => {
    const entries = parseChangelog('## 2026-01-01\n- A long\n  wrapped line\n- Next\n\nStray paragraph\n  indented');
    expect(entries[0].items).toEqual(['A long wrapped line', 'Next']);
  });

  it('handles CRLF line endings', () => {
    expect(parseChangelog('## 2026-01-01\r\n- One\r\n')).toEqual([{ title: '2026-01-01', items: ['One'] }]);
  });
});

/** The About page renders this file, so its shape is checked on every run. */
describe('CHANGELOG.md', () => {
  it('has entries, each with at least one change', () => {
    expect(changelog.length).toBeGreaterThan(0);
    for (const entry of changelog) {
      expect(entry.items.length, `"${entry.title}" has no bullets`).toBeGreaterThan(0);
    }
  });

  it('is headed by ISO dates, newest first, with no repeats', () => {
    const titles = changelog.map((e) => e.title);
    for (const title of titles) expect(title).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(titles).toEqual([...new Set(titles)].sort().reverse());
  });

  it('keeps bullets as plain text, since the page does not render markdown', () => {
    for (const item of changelog.flatMap((e) => e.items)) {
      expect(item, item).not.toMatch(/[`*_\[\]]/);
    }
  });
});
