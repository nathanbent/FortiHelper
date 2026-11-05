import { describe, expect, it } from 'vitest';

import {
  cleanAddress,
  fitName,
  generateObjects,
  normalizeRecords,
  recommendInputModes,
  uniqueName,
  MAX_OBJ_NAME_LEN,
} from '../src/lib/object-helper';
import type { InputFormat } from '../src/lib/object-helper';

const RESOLVED_AT = '2026-01-02 03:04:05Z';
const PLAIN: InputFormat = { mode: 'plain', delimiter: ':', useInputComment: false };

describe('cleanAddress', () => {
  it('reduces URLs to the host', () => {
    expect(cleanAddress('te.drcedirect.com/wida')).toBe('te.drcedirect.com');
    expect(cleanAddress('https://user:pw@portal.example.com:8443/a/b?q=1')).toBe(
      'portal.example.com',
    );
    expect(cleanAddress('http://10.0.0.5:8080/admin')).toBe('10.0.0.5');
    expect(cleanAddress('example.com.')).toBe('example.com');
    expect(cleanAddress('<https://example.com/>')).toBe('example.com');
  });

  it('refangs defanged indicators', () => {
    expect(cleanAddress('hxxps://evil[.]example[.]com/x')).toBe('evil.example.com');
  });

  it('leaves CIDRs and ranges alone', () => {
    expect(cleanAddress('10.0.0.0/24')).toBe('10.0.0.0/24');
    expect(cleanAddress('10.0.0.1-10.0.0.9')).toBe('10.0.0.1-10.0.0.9');
  });
});

describe('fitName / uniqueName', () => {
  const long = 'DRC Insight-us-east-1-content-hosting-form-locker-prod.s3.us-east-1.amazonaws.com';

  it('cuts whole labels to fit the limit', () => {
    const fitted = fitName(long);
    expect(fitted.length).toBeLessThanOrEqual(MAX_OBJ_NAME_LEN);
    expect(fitted).toBe('DRC Insight-us-east-1-content-hosting-form-locker-prod.s3.us-east-1.amazonaws');
  });

  it('keeps the tail', () => {
    const fitted = fitName(long, '-IP-1');
    expect(fitted.endsWith('-IP-1')).toBe(true);
    expect(fitted.length).toBeLessThanOrEqual(MAX_OBJ_NAME_LEN);
  });

  it('returns short names unchanged', () => {
    expect(fitName('short', '-x')).toBe('short-x');
  });

  it('adds -2, -3 until free', () => {
    const taken = new Set(['a', 'a-2']);
    expect(uniqueName('a', (n) => taken.has(n))).toBe('a-3');
    expect(uniqueName('b', (n) => taken.has(n))).toBe('b');
  });
});

describe('normalizeRecords', () => {
  const rec = (name: string | null, value: string) => ({ lineno: 1, name, value, comment: null });

  it('counts issues without changing anything while the fixes are off', () => {
    const issues = { urlLike: 0, swapped: 0, longNames: 0, nameConflicts: 0 };
    const input = [rec(null, 'example.com/path'), rec('10.0.0.1', 'web server')];
    const out = normalizeRecords(input, {}, () => {}, issues);
    expect(out).toEqual(input);
    expect(issues).toMatchObject({ urlLike: 1, swapped: 1 });
  });

  it('cleans and swaps when on, reporting each as a fix', () => {
    const notes: { message: string; kind?: string }[] = [];
    const out = normalizeRecords(
      [rec(null, 'example.com/path'), rec('https://app.example.com/', 'App')],
      { normalizeAddresses: true, fixSwappedPairs: true },
      (message, _line, kind) => notes.push({ message, kind }),
    );
    expect(out.map((r) => [r.name, r.value])).toEqual([
      [null, 'example.com'],
      ['App', 'app.example.com'],
    ]);
    expect(notes.every((n) => n.kind === 'fix')).toBe(true);
    expect(notes).toHaveLength(3);
  });

  it('does not swap when both sides are addresses', () => {
    const issues = { urlLike: 0, swapped: 0, longNames: 0, nameConflicts: 0 };
    normalizeRecords([rec('web.example.com', '10.0.0.1')], {}, () => {}, issues);
    expect(issues.swapped).toBe(0);
  });
});

describe('generation with normalization', () => {
  const input = [
    'te.drcedirect.com/wida',
    'portal.te.drcedirect.com/wida',
    'us-east-1-content-hosting-form-locker-prod.s3.us-east-1.amazonaws.com',
    'us-east-2-content-hosting-form-locker-prod.s3.us-east-2.amazonaws.com',
  ].join('\n');
  const base = { namePrefix: 'DRC Insight', resolvedAt: RESOLVED_AT };

  it('reports the fixable issues while the fixes are off', () => {
    const r = generateObjects(input, base);
    expect(r.issues).toEqual({ urlLike: 2, swapped: 0, longNames: 2, nameConflicts: 0 });
    expect(r.stats.skipped).toBe(2);
  });

  it('fixes them all when on', () => {
    const r = generateObjects(input, {
      ...base,
      normalizeAddresses: true,
      shortenLongNames: true,
    });
    expect(r.issues).toEqual({ urlLike: 0, swapped: 0, longNames: 0, nameConflicts: 0 });
    expect(r.stats.total).toBe(4);
    expect(r.warnings.every((w) => w.kind === 'fix')).toBe(true);
    expect(r.output).toContain('set fqdn "te.drcedirect.com"');
    expect(r.output).toContain(
      'edit "DRC Insight-us-east-1-content-hosting-form-locker-prod.s3.us-east-1.amazonaws"',
    );
    expect(r.output).toContain(
      'edit "DRC Insight-us-east-2-content-hosting-form-locker-prod.s3.us-east-2.amazonaws"',
    );
  });

  it('keeps shortened names unique even without renaming on', () => {
    const a = `${'a'.repeat(40)}.${'a'.repeat(30)}`;
    const r = generateObjects(`${a}x.example.com\n${a}y.example.com`, {
      enablePrefix: false,
      shortenLongNames: true,
    });
    const names = [...r.output.matchAll(/edit "([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(names).size).toBe(names.length);
    expect(r.stats.total).toBe(2);
    expect(names.every((n) => n.length <= MAX_OBJ_NAME_LEN)).toBe(true);
  });

  it('keeps IP object suffixes when shortening', () => {
    const fqdn = `${'b'.repeat(40)}.${'b'.repeat(30)}.example.com`;
    const r = generateObjects(fqdn, {
      enablePrefix: false,
      shortenLongNames: true,
      outputIpObjects: true,
      resolvedAt: RESOLVED_AT,
    }, { [fqdn]: ['1.1.1.1', '2.2.2.2'] });
    expect(r.output).toMatch(/edit "b+\.b+-IP-1"/);
    expect(r.output).toMatch(/edit "b+\.b+-IP-2"/);
  });

  it('renames a name reused for a different address', () => {
    const pairs = 'web\n10.0.0.1\nweb\n10.0.0.2\n';
    const off = generateObjects(pairs, { useExplicitNames: true });
    expect(off.stats.total).toBe(1);
    expect(off.issues.nameConflicts).toBe(1);
    expect(off.warnings.find((w) => w.message.includes('different address'))?.kind).toBeUndefined();

    const on = generateObjects(pairs, { useExplicitNames: true, renameDuplicateNames: true });
    expect(on.stats.total).toBe(2);
    expect(on.output).toContain('edit "Prefix-web-2"');
  });

  it('swaps address-first pairs', () => {
    const r = generateObjects('10.0.0.1\nweb server\n', {
      useExplicitNames: true,
      fixSwappedPairs: true,
    });
    expect(r.output).toContain('edit "Prefix-web server"');
    expect(r.output).toContain('set subnet 10.0.0.1 255.255.255.255');
  });
});

describe('recommendInputModes', () => {
  it('stays quiet when the current mode reads everything', () => {
    expect(recommendInputModes('example.com\n10.0.0.1', PLAIN)).toEqual([]);
  });

  it('suggests delimited mode for name:address lines', () => {
    const [rec] = recommendInputModes('web: example.com\ndb: 10.0.0.5', PLAIN);
    expect(rec).toMatchObject({ mode: 'delimited', delimiter: ':', swap: false });
  });

  it('suggests address-first delimited lines with a swap', () => {
    const [rec] = recommendInputModes('10.0.0.1,web\n10.0.0.2,db', PLAIN);
    expect(rec).toMatchObject({ mode: 'delimited', delimiter: ',', swap: true });
  });

  it('suggests pairs for alternating name / address lines', () => {
    const [rec] = recommendInputModes('web\nexample.com\ndb\n10.0.0.5', PLAIN);
    expect(rec).toMatchObject({ mode: 'pairs', swap: false });
  });

  it('offers both readings of alternating address / text lines', () => {
    const recs = recommendInputModes('example.com\nweb\n10.0.0.5\ndb', PLAIN);
    expect(recs.map((r) => [r.mode, r.useInputComment, r.swap])).toEqual([
      ['plain', true, false],
      ['pairs', false, true],
    ]);
  });

  it('suggests plain when delimited mode finds no delimiters', () => {
    const [rec] = recommendInputModes('example.com\n10.0.0.1', {
      mode: 'delimited',
      delimiter: ',',
      useInputComment: false,
    });
    expect(rec).toMatchObject({ mode: 'plain', useInputComment: false });
  });

  it('suggests spreadsheet mode for tab-separated lines', () => {
    const [rec] = recommendInputModes('web\texample.com\ndb\t10.0.0.5', PLAIN);
    expect(rec.mode).toBe('spreadsheet');
  });

  it('suggests one-per-line when a URL list is read as pairs', () => {
    const text = [
      'https://drc-centraloffice.com',
      'https://drc-wbte-prod.s3.amazonaws.com',
      'https://te.drcedirect.com/wida',
      'https://www.wida-ams.us',
    ].join('\n');
    const recs = recommendInputModes(text, { mode: 'pairs', delimiter: ':', useInputComment: false });
    // Only one reading: the alternate lines are not comments either.
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ mode: 'plain', useInputComment: false, swap: false });
  });

  it('keeps hostname names of IPs as a valid pairs layout', () => {
    const text = 'web.example.com\n10.0.0.1\ndb.example.com\n10.0.0.2';
    expect(
      recommendInputModes(text, { mode: 'pairs', delimiter: ':', useInputComment: false }),
    ).toEqual([]);
  });
});

describe('URL names', () => {
  it('cleans a URL used as a name and hints at the fix while off', () => {
    const text = 'https://a.example.com\nhttps://b.example.com/x\n';
    const off = generateObjects(text, { useExplicitNames: true });
    expect(off.issues.urlLike).toBe(2);
    expect(off.warnings[0].message).toContain('turn on "Clean up URLs"');

    const on = generateObjects(text, { useExplicitNames: true, normalizeAddresses: true });
    expect(on.output).toContain('edit "Prefix-a.example.com"');
    expect(on.output).toContain('set fqdn "b.example.com"');
  });
});
