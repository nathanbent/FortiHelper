import { describe, expect, it } from 'vitest';
import { buildReferenceExport, buildTemplatesExport, EXPORT_VERSION } from '../src/lib/export';
import { referenceSections, sharedVariables } from '../src/lib/reference';
import { loadTemplates } from '../src/lib/quickstart/templates';

const raw = (pattern: Record<string, unknown>) => pattern as Record<string, string>;
const sheetFiles = raw(
  import.meta.glob('../content/reference/*.md', { query: '?raw', import: 'default', eager: true }),
);
const catalogue = Object.values(
  raw(import.meta.glob('../content/reference-variables.md', { query: '?raw', import: 'default', eager: true })),
)[0];
const templateFiles = raw(
  import.meta.glob('../content/quickstart/*.md', { query: '?raw', import: 'default', eager: true }),
);

describe('reference.json', () => {
  const out = buildReferenceExport(sheetFiles, catalogue);

  it('is labelled and versioned', () => {
    expect(out.format).toBe('fortihelper-reference');
    expect(out.version).toBe(EXPORT_VERSION);
  });

  it('carries every sheet the app shows, in the same order and with the same content', () => {
    expect(out.sheets.map((s) => s.id)).toEqual(referenceSections.map((s) => s.id));
    for (const [i, sheet] of out.sheets.entries()) {
      expect(sheet).toMatchObject(referenceSections[i]);
    }
  });

  it('carries the shared variables and each sheet\'s placeholders', () => {
    expect(out.variables).toEqual([...sharedVariables.values()]);
    const poe = out.sheets.find((s) => s.id === 'fortiswitch-poe')!;
    expect(poe.placeholders).toEqual(['<FortiSwitch_serial_number>', '<port>', '<switch-id>']);
  });

  it('lists the vocabularies a reader needs to interpret it', () => {
    expect(out.topics.map((t) => t.value)).toContain('ipsec');
    expect(out.kinds.map((k) => k.value)).toContain('diagnostics');
    for (const sheet of out.sheets) {
      expect(out.topics.map((t) => t.value)).toContain(sheet.topic);
      expect(out.kinds.map((k) => k.value)).toContain(sheet.kind);
    }
  });

  it('survives a round trip through JSON unchanged', () => {
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe('templates.json', () => {
  const out = buildTemplatesExport(templateFiles);

  it('carries every committed template with its fields and body', () => {
    const committed = loadTemplates().filter((t) => !t.private);
    expect(out.templates.map((t) => t.id).sort()).toEqual(committed.map((t) => t.id).sort());
    for (const template of out.templates) {
      const source = committed.find((t) => t.id === template.id)!.parsed;
      expect(template.title).toBe(source.title);
      expect(template.body).toBe(source.body);
      expect(template.variables.map((v) => v.name)).toEqual(source.variables.map((v) => v.name));
    }
  });

  it('survives a round trip through JSON unchanged', () => {
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe('private content', () => {
  it('is refused rather than exported', () => {
    const file = { 'content/quickstart/private/site.md': '# Secret site' };
    expect(() => buildTemplatesExport(file)).toThrow(/private/);
    expect(() => buildReferenceExport(file, '')).toThrow(/private/);
  });
});
