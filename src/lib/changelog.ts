import source from '../../CHANGELOG.md?raw';

/** One dated block of CHANGELOG.md. */
export interface ChangelogEntry {
  /** The `## ` heading text: an ISO date. */
  title: string;
  items: string[];
}

/**
 * Parse the small subset of markdown CHANGELOG.md uses: `## ` headings, each
 * followed by `- ` bullets. A bullet may wrap onto indented lines. Anything
 * else (the title, the intro paragraph) is ignored.
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | undefined;
  let inItem = false;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = { title: heading[1], items: [] };
      entries.push(current);
      inItem = false;
      continue;
    }
    if (!current) continue;
    const bullet = /^[-*]\s+(.+?)\s*$/.exec(line);
    if (bullet) {
      current.items.push(bullet[1]);
      inItem = true;
    } else if (inItem && /^\s+\S/.test(line)) {
      current.items[current.items.length - 1] += ` ${line.trim()}`;
    } else {
      inItem = false;
    }
  }
  return entries;
}

/** The repo's CHANGELOG.md, newest entry first. */
export const changelog: ChangelogEntry[] = parseChangelog(source);
