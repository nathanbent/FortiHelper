/**
 * Page help: the collapsed "How this page works" panel under each page's
 * heading.
 *
 * Each page has one markdown file, content/help/<page id>.md, made of up to
 * five sections in a fixed order:
 *
 *     ## Use it for
 *     The job, and when to pick another page instead.
 *
 *     ## Give it
 *     Accepted input, with one short example such as `198.51.100.0/24`.
 *
 *     ## You get
 *     What the output is and what to do with it.
 *
 *     ## Limits
 *     What it does not handle, and what to check by hand.
 *
 *     ## More
 *     [A link]({repo}#readme) or [another page](#/reference).
 *
 * Leave out a section that would be empty. Inside a section, a blank line
 * starts a new paragraph, `backticks` mark code, and [text](target) is a
 * link; `{repo}` in a target is replaced with the repository URL. Nothing
 * else is markup.
 *
 * Anything a user must know to get correct output belongs in a visible hint
 * on the page, not only here: most people never open this panel.
 *
 * A page without a file, a file without a page, or a malformed file fails
 * `tests/help.test.ts`, and so the build.
 */

/**
 * Every page id. `Tool.id` is typed from this list, so a new tool does not
 * compile until its id is added here, and the tests then ask for its help.
 */
export const PAGE_IDS = [
  'home',
  'object-helper',
  'webfilter',
  'content-filter',
  'onboarding',
  'forti-edit',
  'reference',
  'quickstart',
  'about',
] as const;

export type PageId = (typeof PAGE_IDS)[number];

/** Section labels, in the only order they may appear. */
export const HELP_LABELS = ['Use it for', 'Give it', 'You get', 'Limits', 'More'] as const;

export type HelpLabel = (typeof HELP_LABELS)[number];

/** The summary text of the panel, the same on every page. */
export const HELP_SUMMARY = 'How this page works';

/** Upper bound on the words in one page's help. */
export const HELP_MAX_WORDS = 200;

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

export interface HelpSection {
  label: HelpLabel;
  paragraphs: Inline[][];
}

export interface PageHelp {
  sections: HelpSection[];
  /** Words a reader sees: link targets and markup are not counted. */
  words: number;
}

const INLINE_RE = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Link targets a help file may use: another page, the repo, or https. */
const HREF_RE = /^(#\/|\{repo\}|https:\/\/)/;

/** Split one paragraph into text, code and link runs. */
export function parseInline(text: string, name = 'help'): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    if (match.index > last) out.push({ kind: 'text', text: text.slice(last, match.index) });
    if (match[1] !== undefined) {
      out.push({ kind: 'code', text: match[1] });
    } else {
      if (!HREF_RE.test(match[3])) {
        throw new Error(`${name}: link target "${match[3]}" must start with #/, {repo} or https://`);
      }
      out.push({ kind: 'link', text: match[2], href: match[3] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** Parse one help file. Throws, naming the file, on anything malformed. */
export function parseHelp(markdown: string, name = 'help'): PageHelp {
  const sections: HelpSection[] = [];
  let current: HelpSection | null = null;
  let paragraph: string[] = [];
  let lastIndex = -1;

  const flush = () => {
    if (!paragraph.length) return;
    current!.paragraphs.push(parseInline(paragraph.join(' '), name));
    paragraph = [];
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      if (current) flush();
      const index = HELP_LABELS.indexOf(heading[1] as HelpLabel);
      if (index === -1) {
        throw new Error(`${name}: unknown section "${heading[1]}"; use ${HELP_LABELS.join(', ')}`);
      }
      if (index <= lastIndex) {
        throw new Error(`${name}: section "${heading[1]}" is repeated or out of order`);
      }
      lastIndex = index;
      current = { label: HELP_LABELS[index], paragraphs: [] };
      sections.push(current);
    } else if (line.startsWith('#')) {
      throw new Error(`${name}: only "## <section>" headings are allowed, found "${line}"`);
    } else if (line === '') {
      if (current) flush();
    } else {
      if (!current) throw new Error(`${name}: text before the first section: "${line}"`);
      paragraph.push(line);
    }
  }
  if (current) flush();

  if (!sections.length) throw new Error(`${name}: no sections`);
  for (const section of sections) {
    if (!section.paragraphs.length) throw new Error(`${name}: section "${section.label}" is empty`);
  }

  const words = sections
    .flatMap((s) => s.paragraphs.flat())
    .map((run) => run.text)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  if (words > HELP_MAX_WORDS) {
    throw new Error(`${name}: ${words} words, the limit is ${HELP_MAX_WORDS}; move detail to the README`);
  }
  return { sections, words };
}

/** Every help file, keyed by page id (the filename without `.md`). */
export function loadHelp(): Map<string, PageHelp> {
  const files = import.meta.glob('../../../content/help/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const out = new Map<string, PageHelp>();
  for (const [path, markdown] of Object.entries(files)) {
    const file = path.split('/').pop()!;
    out.set(file.replace(/\.md$/, ''), parseHelp(markdown, `content/help/${file}`));
  }
  return out;
}

/** Help for every page. */
export const pageHelp: Map<string, PageHelp> = loadHelp();
