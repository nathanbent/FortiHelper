import { describe, expect, it } from 'vitest';
import {
  referenceSections,
  REFERENCE_TOPICS,
  REFERENCE_KINDS,
  topicLabel,
  kindLabel,
  sectionItemCount,
} from '../src/lib/reference';

const topics = REFERENCE_TOPICS.map((t) => t.value);
const kinds = REFERENCE_KINDS.map((k) => k.value);

/**
 * These guard the content, not the code: they are what tells you a new
 * cheat sheet is malformed before it reaches the page.
 */
describe('reference content', () => {
  it('has sections', () => {
    expect(referenceSections.length).toBeGreaterThan(0);
  });

  it('gives every section a unique id', () => {
    const ids = referenceSections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses ids that are safe in a DOM id and a URL', () => {
    for (const section of referenceSections) {
      expect(section.id, section.title).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it.each(referenceSections.map((s) => [s.id, s] as const))('%s is well formed', (_id, section) => {
    expect(section.title.trim()).not.toBe('');
    expect(topics).toContain(section.topic);
    expect(kinds).toContain(section.kind);

    // A section with nothing in it renders as an empty box.
    expect(sectionItemCount(section)).toBeGreaterThan(0);

    for (const entry of section.entries ?? []) {
      // Exactly one of command/text — the UI renders `command ?? text`, so
      // setting both silently drops one.
      const hasCommand = entry.command !== undefined;
      const hasText = entry.text !== undefined;
      expect(hasCommand !== hasText, `${section.id}: ${JSON.stringify(entry)}`).toBe(true);
      expect((entry.command ?? entry.text ?? '').trim()).not.toBe('');
      if (entry.swatch !== undefined) {
        expect(entry.swatch).toBeGreaterThanOrEqual(1);
        expect(entry.swatch).toBeLessThanOrEqual(32);
      }
    }

    for (const snippet of section.snippets ?? []) {
      expect(snippet.title.trim()).not.toBe('');
      expect(snippet.body.trim()).not.toBe('');
      // A snippet is a block; single-line content belongs in `entries`.
      expect(snippet.body.split('\n').length, snippet.title).toBeGreaterThan(1);
      expect(snippet.body.endsWith('\n'), `${snippet.title} has a trailing newline`).toBe(false);
    }
  });

  it('only marks copyAll on sections that have commands to copy', () => {
    for (const section of referenceSections.filter((s) => s.copyAll)) {
      const commands = (section.entries ?? []).filter((e) => e.command !== undefined);
      expect(commands.length, section.id).toBeGreaterThan(1);
    }
  });

  it('counts entries and snippets together', () => {
    const colors = referenceSections.find((s) => s.id === 'fortigate-colors')!;
    expect(sectionItemCount(colors)).toBe(32);
    const templates = referenceSections.find((s) => s.id === 'ipsec-templates')!;
    expect(sectionItemCount(templates)).toBe(2);
  });
});

describe('reference taxonomy', () => {
  it('has a unique value and a label for every topic and kind', () => {
    expect(new Set(topics).size).toBe(topics.length);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const t of REFERENCE_TOPICS) expect(t.label.trim()).not.toBe('');
    for (const k of REFERENCE_KINDS) expect(k.label.trim()).not.toBe('');
  });

  it('resolves labels, falling back to the raw value', () => {
    expect(topicLabel('ipsec')).toBe('IPsec VPN');
    expect(kindLabel('config')).toBe('Config templates');
  });

  it('leaves no topic without content, so no dropdown option is a dead end', () => {
    const used = new Set(referenceSections.map((s) => s.topic));
    const unused = topics.filter((t) => !used.has(t));
    expect(unused, `topics with no sections: ${unused.join(', ')}`).toEqual([]);
  });

  it('leaves no kind without content', () => {
    const used = new Set(referenceSections.map((s) => s.kind));
    expect(kinds.filter((k) => !used.has(k))).toEqual([]);
  });
});
