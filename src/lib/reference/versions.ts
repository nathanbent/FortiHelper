/**
 * FortiOS version limits on sheets and commands.
 *
 * A sheet or a command can say which releases it applies to: `since` is the
 * first release that has it, `until` the first release that no longer does.
 * The reader can enter the version they run, to hide what does not apply.
 */

/** `7.4` or `7.4.4` -> its numeric parts, or null when it is not a version. */
export function parseVersion(text: string): number[] | null {
  const trimmed = text.trim().replace(/^v/i, '');
  if (!/^\d+(\.\d+){0,2}$/.test(trimmed)) return null;
  return trimmed.split('.').map(Number);
}

/** Compare two versions part by part, missing parts padded with `pad`. */
function compare(a: number[], b: number[], padA: number): number {
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? padA) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Whether something limited to [since, until) applies to the `running`
 * version. A partial version such as `7.4` stands for every 7.4.x release,
 * and only rules something out when no release in that range qualifies: an
 * uncertain answer keeps the row on screen rather than hiding it.
 */
export function versionApplies(
  running: number[] | null,
  limits: { since?: string; until?: string },
): boolean {
  if (!running) return true;
  const since = limits.since ? parseVersion(limits.since) : null;
  const until = limits.until ? parseVersion(limits.until) : null;
  // The newest release `running` could mean must have reached `since`...
  if (since && compare(running, since, Infinity) < 0) return false;
  // ...and the oldest must still be before `until`.
  if (until && compare(running, until, 0) >= 0) return false;
  return true;
}

/** Badge text for a limit: `7.4+`, `before 7.4.4`, or `6.4 to 7.2` style. */
export function versionBadge(limits: { since?: string; until?: string }): string | null {
  const { since, until } = limits;
  if (since && until) return `FortiOS ${since} up to ${until}`;
  if (since) return `FortiOS ${since}+`;
  if (until) return `Before FortiOS ${until}`;
  return null;
}
