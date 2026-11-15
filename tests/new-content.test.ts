import { describe, expect, it } from 'vitest';
import {
  frontMatter,
  listValues,
  nextOrder,
  sheetScaffold,
  templateScaffold,
  titleFromId,
  // @ts-expect-error plain JS script, no types.
} from '../scripts/new-content.mjs';
import { parseSheet } from '../src/lib/reference/markdown';
import { REFERENCE_KINDS, REFERENCE_TOPICS } from '../src/lib/reference';
import { TEMPLATE_CATEGORIES, parseQuickstart } from '../src/lib/quickstart';

declare const process: {
  getBuiltinModule(name: 'node:fs'): { readFileSync(path: URL, encoding: 'utf-8'): string };
};
const read = (rel: string) =>
  process.getBuiltinModule('node:fs').readFileSync(new URL(`../${rel}`, import.meta.url), 'utf-8');

const topics = REFERENCE_TOPICS.map((t) => t.value);
const kinds = REFERENCE_KINDS.map((k) => k.value);
const categories = TEMPLATE_CATEGORIES.map((c) => c.value);

describe('new-content reads its lists from the app source', () => {
  it('finds the same topics, kinds and categories the app uses', () => {
    const types = read('src/lib/reference/types.ts');
    expect(listValues(types, 'REFERENCE_TOPICS')).toEqual(topics);
    expect(listValues(types, 'REFERENCE_KINDS')).toEqual(kinds);
    expect(listValues(read('src/lib/quickstart/index.ts'), 'TEMPLATE_CATEGORIES')).toEqual(categories);
  });

  it('fails loudly if a list is renamed away', () => {
    expect(() => listValues('const x = 1', 'REFERENCE_TOPICS')).toThrow(/could not find/);
  });
});

describe('new-content helpers', () => {
  it('derives a title, reads front matter and picks the next order', () => {
    expect(titleFromId('sslvpn-debug')).toBe('Sslvpn debug');
    expect(frontMatter('---\nid: a\n# note: skipped\norder: 5\n---\nbody')).toEqual({ id: 'a', order: '5' });
    expect(frontMatter('# No front matter')).toEqual({});
    expect(nextOrder([10, 64.8, NaN])).toBe(65);
    expect(nextOrder([])).toBe(10);
  });
});

describe('scaffolds are valid as written', () => {
  it('a new sheet parses, with its comments ignored', () => {
    const text = sheetScaffold({
      id: 'new-one', title: 'New one', topic: 'ha', kind: 'diagnostics', order: 57, topics, kinds,
    });
    const sheet = parseSheet(text, 'new-one.md');
    expect(sheet).toMatchObject({ id: 'new-one', title: 'New one', topic: 'ha', kind: 'diagnostics', order: 57 });
    expect(sheet.copyAll).toBeUndefined();
    expect(sheet.runOn).toBeUndefined();
    expect(sheet.since).toBeUndefined();
    expect(sheet.entries).toHaveLength(1);
  });

  it('a new template parses without warnings', () => {
    const text = templateScaffold({ title: 'New site', category: 'vpn', order: 20, categories });
    const template = parseQuickstart(text);
    expect(template).toMatchObject({ title: 'New site', category: 'vpn', order: 20 });
    expect(template.variables.map((v: { name: string }) => v.name)).toEqual(['<site-name>']);
    expect(template.warnings).toEqual([]);
  });
});
