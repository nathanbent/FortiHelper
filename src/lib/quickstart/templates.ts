import { parseQuickstart, type QuickstartTemplate } from './index';

export interface BundledTemplate {
  /** Filename without extension, used as the select value. */
  id: string;
  /** True when the file came from content/quickstart/private/. */
  private: boolean;
  /** Raw markdown, handed to the panel. */
  markdown: string;
  /** Parsed once here so the picker can show real titles. */
  parsed: QuickstartTemplate;
}

/**
 * Every template under content/quickstart/, inlined at build time.
 *
 * Adding one is adding a markdown file — its title and fields come from the
 * file itself, so nothing here changes.
 *
 * The nested private/ directory is gitignored, so a build from a clean clone
 * of the public repo ships only the committed examples, while a build from a
 * working copy that has private templates picks those up too.
 */
export function loadTemplates(): BundledTemplate[] {
  const files = import.meta.glob('../../../content/quickstart/**/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  return Object.entries(files)
    .map(([path, markdown]) => ({
      id: (path.split('/').pop() ?? path).replace(/\.md$/, ''),
      private: path.includes('/private/'),
      markdown,
      parsed: parseQuickstart(markdown),
    }))
    // Within a category: private first (on a build that has them, those are
    // the ones in daily use), then the front matter `order`, then title.
    .sort(
      (a, b) =>
        Number(b.private) - Number(a.private) ||
        a.parsed.order - b.parsed.order ||
        a.parsed.title.localeCompare(b.parsed.title),
    );
}
