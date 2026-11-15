import { describe, expect, it } from 'vitest';
import { parseVersion, referenceSections, versionApplies, versionBadge } from '../src/lib/reference';

describe('parseVersion', () => {
  it('reads one to three parts, with an optional leading v', () => {
    expect(parseVersion('7')).toEqual([7]);
    expect(parseVersion(' 7.4 ')).toEqual([7, 4]);
    expect(parseVersion('v7.4.5')).toEqual([7, 4, 5]);
  });

  it('rejects anything else', () => {
    for (const bad of ['', '7.', '7.4.5.1', 'seven', '7.x']) expect(parseVersion(bad)).toBeNull();
  });
});

describe('versionApplies', () => {
  const applies = (running: string, limits: { since?: string; until?: string }) =>
    versionApplies(parseVersion(running), limits);

  it('applies everything when no version is entered or no limit is set', () => {
    expect(versionApplies(null, { since: '9.0' })).toBe(true);
    expect(applies('6.0', {})).toBe(true);
  });

  it('honours since (inclusive) and until (exclusive)', () => {
    expect(applies('7.4.4', { since: '7.4.4' })).toBe(true);
    expect(applies('7.4.3', { since: '7.4.4' })).toBe(false);
    expect(applies('7.4.4', { until: '7.4.4' })).toBe(false);
    expect(applies('7.4.3', { until: '7.4.4' })).toBe(true);
    expect(applies('7.2.8', { since: '7.4' })).toBe(false);
    expect(applies('7.6.0', { since: '7.4' })).toBe(true);
  });

  it('keeps both sides when a partial version cannot tell', () => {
    // 7.4 could be 7.4.0 or 7.4.9: neither side of a 7.4.4 split is ruled out.
    expect(applies('7.4', { since: '7.4.4' })).toBe(true);
    expect(applies('7.4', { until: '7.4.4' })).toBe(true);
    // ...but it does settle a split on the minor version.
    expect(applies('7.4', { until: '7.4' })).toBe(false);
    expect(applies('7.2', { since: '7.4' })).toBe(false);
  });
});

describe('versionBadge', () => {
  it('describes each kind of limit', () => {
    expect(versionBadge({})).toBeNull();
    expect(versionBadge({ since: '7.4' })).toBe('FortiOS 7.4+');
    expect(versionBadge({ until: '7.4' })).toBe('Before FortiOS 7.4');
    expect(versionBadge({ since: '6.4', until: '7.6' })).toBe('FortiOS 6.4 up to 7.6');
  });
});

describe('version limits in the bundled sheets', () => {
  it('are all real versions, with since before until', () => {
    const limited = [...referenceSections, ...referenceSections.flatMap((s) => s.entries ?? [])];
    for (const { since, until } of limited) {
      if (since) expect(parseVersion(since), since).not.toBeNull();
      if (until) expect(parseVersion(until), until).not.toBeNull();
      if (since && until) expect(versionApplies(parseVersion(since), { until })).toBe(true);
    }
  });

  it('never leaves a sheet with no commands at all for some version', () => {
    for (const version of ['6.4', '7.0', '7.2', '7.4.3', '7.4.4', '7.6']) {
      const running = parseVersion(version);
      for (const s of referenceSections.filter((s) => versionApplies(running, s))) {
        const left = (s.entries ?? []).filter((e) => versionApplies(running, e)).length;
        expect(left + (s.snippets?.length ?? 0), `${s.id} on ${version}`).toBeGreaterThan(0);
      }
    }
  });
});
