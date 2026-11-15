import { describe, expect, it } from 'vitest';
import {
  HELP_LABELS,
  HELP_MAX_WORDS,
  PAGE_IDS,
  pageHelp,
  parseHelp,
  parseInline,
} from '../src/lib/help';

/**
 * These guard the content: every page has a help file, every help file has a
 * page, and each one keeps to the shared shape.
 */
describe('page help content', () => {
  it('has a file for every page', () => {
    for (const id of PAGE_IDS) {
      expect(pageHelp.has(id), `content/help/${id}.md is missing`).toBe(true);
    }
  });

  it('has no file without a page', () => {
    for (const id of pageHelp.keys()) {
      expect(PAGE_IDS as readonly string[], `content/help/${id}.md has no page`).toContain(id);
    }
  });

  it('says what each page is for and what its limits are', () => {
    for (const [id, help] of pageHelp) {
      const labels = help.sections.map((s) => s.label);
      expect(labels, id).toContain('Use it for');
      expect(labels, id).toContain('Limits');
    }
  });

  it('only links to pages that exist', () => {
    for (const [id, help] of pageHelp) {
      for (const run of help.sections.flatMap((s) => s.paragraphs.flat())) {
        if (run.kind !== 'link' || !run.href.startsWith('#/')) continue;
        expect(PAGE_IDS as readonly string[], `${id} links to ${run.href}`).toContain(
          run.href.slice(2).split('/')[0],
        );
      }
    }
  });
});

describe('parseHelp', () => {
  it('reads sections, paragraphs and inline markup', () => {
    const help = parseHelp(
      [
        '## Use it for',
        'Making `edit` blocks.',
        'Same paragraph.',
        '',
        'Second paragraph.',
        '',
        '## More',
        '[The README]({repo}#readme)',
      ].join('\n'),
    );
    expect(help.sections.map((s) => s.label)).toEqual(['Use it for', 'More']);
    expect(help.sections[0].paragraphs).toEqual([
      [
        { kind: 'text', text: 'Making ' },
        { kind: 'code', text: 'edit' },
        { kind: 'text', text: ' blocks. Same paragraph.' },
      ],
      [{ kind: 'text', text: 'Second paragraph.' }],
    ]);
    expect(help.sections[1].paragraphs[0]).toEqual([
      { kind: 'link', text: 'The README', href: '{repo}#readme' },
    ]);
    // Link targets are not counted, link text is.
    expect(help.words).toBe(9);
  });

  it('rejects an unknown section', () => {
    expect(() => parseHelp('## Tips\nText.', 'x.md')).toThrow(/x\.md: unknown section "Tips"/);
  });

  it('rejects sections out of order or repeated', () => {
    expect(() => parseHelp('## Limits\nA.\n\n## Give it\nB.')).toThrow(/out of order/);
    expect(() => parseHelp('## Limits\nA.\n\n## Limits\nB.')).toThrow(/repeated/);
  });

  it('rejects an empty section, stray text and other headings', () => {
    expect(() => parseHelp('## Use it for\n\n## Limits\nA.')).toThrow(/is empty/);
    expect(() => parseHelp('Hello.\n\n## Limits\nA.')).toThrow(/before the first section/);
    expect(() => parseHelp('# Title\n\n## Limits\nA.')).toThrow(/only "## <section>" headings/);
    expect(() => parseHelp('')).toThrow(/no sections/);
  });

  it('rejects help over the word limit', () => {
    const long = Array(HELP_MAX_WORDS + 1).fill('word').join(' ');
    expect(() => parseHelp(`## ${HELP_LABELS[0]}\n${long}`)).toThrow(/the limit is 200/);
  });

  it('rejects link targets that are not a page, the repo or https', () => {
    expect(() => parseInline('[x](javascript:alert(1))')).toThrow(/must start with/);
    expect(() => parseInline('[x](http://example.com)')).toThrow(/must start with/);
    expect(parseInline('[x](https://example.com)')[0]).toMatchObject({ kind: 'link' });
  });
});
