import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_SHEET,
  addCustomSheet,
  parseCustomSheets,
  referenceSections,
} from '../src/lib/reference';

const bundled = new Set(referenceSections.map((s) => s.id));
const sheet = (id: string, title = 'Mine') =>
  ['---', `id: ${id}`, `title: ${title}`, 'topic: general', 'kind: diagnostics', '---', '', '`get system status`'].join('\n');

describe('parseCustomSheets', () => {
  it('parses good sheets and keeps their markdown', () => {
    const { sheets, errors } = parseCustomSheets([sheet('one'), sheet('two')], bundled);
    expect(errors).toEqual([]);
    expect(sheets.map((s) => s.id)).toEqual(['one', 'two']);
    expect(sheets[0].markdown).toBe(sheet('one'));
  });

  it('reports, rather than drops, a sheet that does not parse', () => {
    const { sheets, errors } = parseCustomSheets(['not a sheet', sheet('ok')], bundled);
    expect(sheets.map((s) => s.id)).toEqual(['ok']);
    expect(errors).toHaveLength(1);
    expect(errors[0].markdown).toBe('not a sheet');
    expect(errors[0].message).toMatch(/front matter/);
  });

  it('refuses an id a built-in sheet uses, a repeated id, and an unsafe id', () => {
    const clash = [...bundled][0];
    const { sheets, errors } = parseCustomSheets(
      [sheet(clash), sheet('dup'), sheet('dup'), sheet('Bad_Id')],
      bundled,
    );
    expect(sheets.map((s) => s.id)).toEqual(['dup']);
    expect(errors.map((e) => e.message)).toEqual([
      expect.stringMatching(/built-in sheet/),
      expect.stringMatching(/another of your sheets/),
      expect.stringMatching(/lowercase letters/),
    ]);
  });
});

describe('addCustomSheet', () => {
  it('appends a new sheet', () => {
    const result = addCustomSheet([sheet('one')], `  ${sheet('two')}\n`, bundled);
    expect(result).toEqual({ ok: true, list: [sheet('one'), sheet('two')], id: 'two', replaced: false });
  });

  it('replaces a sheet with the same id in place', () => {
    const result = addCustomSheet([sheet('one'), sheet('two')], sheet('one', 'Edited'), bundled);
    expect(result).toEqual({
      ok: true,
      list: [sheet('one', 'Edited'), sheet('two')],
      id: 'one',
      replaced: true,
    });
  });

  it('leaves the list alone and explains when the sheet is bad or empty', () => {
    expect(addCustomSheet([], '   ', bundled)).toEqual({ ok: false, error: 'Paste a sheet first.' });
    const bad = addCustomSheet([sheet('one')], 'oops', bundled);
    expect(bad.ok).toBe(false);
    expect(addCustomSheet([], sheet([...bundled][0]), bundled)).toMatchObject({ ok: false });
  });

  it('still adds when an older stored sheet no longer parses', () => {
    const result = addCustomSheet(['broken'], sheet('one'), bundled);
    expect(result).toMatchObject({ ok: true, list: ['broken', sheet('one')] });
  });
});

describe('the example sheet', () => {
  it('is a valid sheet that can be added as is', () => {
    expect(addCustomSheet([], EXAMPLE_SHEET, bundled)).toMatchObject({ ok: true, id: 'my-first-sheet' });
  });
});
