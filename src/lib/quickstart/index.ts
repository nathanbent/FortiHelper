import type { Warning } from '../../types';

/** Template categories, in display order. `other` is the fallback bucket. */
export const TEMPLATE_CATEGORIES = [
  { value: 'site', label: 'Site build-out' },
  { value: 'vpn', label: 'VPN' },
  { value: 'policy', label: 'Security policy' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'other', label: 'Other' },
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]['value'];

export function categoryLabel(category: TemplateCategory): string {
  return TEMPLATE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

/**
 * Quickstart templates are markdown documents that describe their own inputs,
 * so the app can build a form from them without knowing anything in advance:
 *
 *     # <title>
 *
 *     ## Variables
 *     - <site-short-name> - Short site name - e.g. TI
 *     - <WAN-port-name> - WAN port name - e.g. wan1
 *
 *     ```
 *     config system interface
 *         edit "<WAN-port-name>"
 *     ...
 *     ```
 *
 * The `## Variables` list supplies each field's label and example; the fenced
 * block is the config that gets filled in.
 */

export interface QuickstartVariable {
  /** Placeholder as it appears in the body, including angle brackets. */
  name: string;
  /** Label for the field, from the Variables list. */
  description: string;
  /** Example value, from a trailing "e.g. …" on the Variables line. */
  example: string;
  /** True when the placeholder is used in the body but not documented. */
  undocumented: boolean;
  /** How many times the placeholder occurs in the body. */
  occurrences: number;
}

export interface QuickstartTemplate {
  /** First `# ` heading, or the front matter `title`, or a fallback. */
  title: string;
  /** Front matter `category`, defaulting to 'other'. */
  category: TemplateCategory;
  /** Front matter `description`, for the template card. Empty when unset. */
  description: string;
  /** Front matter `order`; lower sorts first within a category. Default 100. */
  order: number;
  /** Every placeholder the form needs, documented ones first. */
  variables: QuickstartVariable[];
  /** The config text the placeholders are substituted into. */
  body: string;
  warnings: Warning[];
}

/**
 * A placeholder: `<name>` with a letter-led, word-ish name. Deliberately
 * narrow so ordinary angle brackets in config text are not mistaken for one.
 */
const PLACEHOLDER_RE = /<[A-Za-z][A-Za-z0-9_.-]*>/g;

/**
 * Markup that shows up inside config values — the pre-login banner in the
 * bundled template is HTML — and must not be offered as a form field. Only
 * applies to undocumented placeholders: listing one under "## Variables"
 * makes it a variable regardless.
 */
const HTML_TAGS = new Set([
  'a', 'b', 'i', 'u', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'div', 'span', 'strong', 'em', 'small', 'big', 'sub', 'sup', 'center',
  'font', 'pre', 'code', 'blockquote', 'img', 'table', 'tr', 'td', 'th',
  'thead', 'tbody', 'tfoot', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'html', 'head', 'body', 'title', 'style', 'script', 'form', 'input',
  'label', 'section', 'header', 'footer', 'nav', 'main', 'article',
]);

/** `- <name> - description - e.g. example` */
const VARIABLE_LINE_RE = /^[-*]\s*(<[A-Za-z][A-Za-z0-9_.-]*>)\s*[-–—]\s*(.+)$/;

function splitLines(text: string): string[] {
  return text.split(/\r\n|[\n\r]/);
}

const CATEGORY_VALUES = new Set<string>(TEMPLATE_CATEGORIES.map((c) => c.value));

/**
 * Optional leading `---` front matter. Templates written before it existed
 * parse exactly as they did, so nothing has to be retrofitted.
 */
function splitFrontMatter(lines: string[]): { meta: Record<string, string>; rest: string[] } {
  if (lines[0]?.trim() !== '---') return { meta: {}, rest: lines };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) return { meta: {}, rest: lines };

  const meta: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const at = line.indexOf(':');
    if (at === -1) continue;
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { meta, rest: lines.slice(end + 1) };
}

/**
 * Collect every fenced code block, joined by a blank line, falling back to the
 * whole document when there are none.
 *
 * Templates split their config into sections with prose between them — a
 * config block and then the diagnostic commands that make it take effect, say
 * — and all of it is part of what you paste. Prose between blocks is not.
 */
function extractBody(lines: string[]): { body: string; fenced: boolean } {
  const blocks: string[] = [];
  let open = -1;

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trimStart().startsWith('```')) continue;
    if (open === -1) {
      open = i;
    } else {
      blocks.push(lines.slice(open + 1, i).join('\n'));
      open = -1;
    }
  }
  // An unclosed final fence still means "everything after it is body".
  if (open !== -1) blocks.push(lines.slice(open + 1).join('\n'));

  if (blocks.length === 0) return { body: lines.join('\n').trim(), fenced: false };

  const body = blocks
    .map((b) => b.replace(/^\n+|\n+$/g, ''))
    .filter(Boolean)
    .join('\n\n');
  return { body, fenced: true };
}

/** Parse the `## Variables` list into name → {description, example}. */
function extractVariables(lines: string[]): Map<string, { description: string; example: string }> {
  const found = new Map<string, { description: string; example: string }>();

  const start = lines.findIndex((l) => /^#{1,6}\s+variables\b/i.test(l.trim()));
  if (start === -1) return found;

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at the next heading of the same or higher level.
    if (/^#{1,6}\s/.test(line.trim())) break;
    const match = VARIABLE_LINE_RE.exec(line.trim());
    if (!match) continue;

    const [, name, rest] = match;
    // A trailing "- e.g. value" is the example; the rest is the label.
    const eg = /^(.*?)\s*[-–—]\s*e\.?g\.?[:\s]\s*(.+)$/i.exec(rest);
    found.set(name, {
      description: (eg ? eg[1] : rest).trim(),
      example: eg ? eg[2].trim() : '',
    });
  }
  return found;
}

/** Parse a quickstart template into a title, a variable list, and a body. */
export function parseQuickstart(markdown: string): QuickstartTemplate {
  const { meta, rest: lines } = splitFrontMatter(splitLines(markdown));
  const warnings: Warning[] = [];

  const titleLine = lines.find((l) => /^#\s+\S/.test(l.trim()));
  const title =
    meta.title || (titleLine ? titleLine.trim().replace(/^#\s+/, '') : 'Quickstart template');

  let category: TemplateCategory = 'other';
  if (meta.category) {
    if (CATEGORY_VALUES.has(meta.category)) {
      category = meta.category as TemplateCategory;
    } else {
      warnings.push({
        message: `Unknown category "${meta.category}" — falling back to Other. Valid: ${TEMPLATE_CATEGORIES.map(
          (c) => c.value,
        ).join(', ')}`,
      });
    }
  }

  const order = meta.order === undefined ? 100 : Number(meta.order);

  const { body, fenced } = extractBody(lines);
  if (!fenced) {
    warnings.push({
      message:
        'No fenced code block found — using the whole document as the template body. Wrap the config in ``` fences to be explicit.',
    });
  }

  const documented = extractVariables(lines);
  if (documented.size === 0) {
    warnings.push({
      message:
        'No "## Variables" list found — fields were derived from the placeholders in the body instead.',
    });
  }

  // Count placeholders as they appear in the body.
  const counts = new Map<string, number>();
  for (const match of body.matchAll(PLACEHOLDER_RE)) {
    counts.set(match[0], (counts.get(match[0]) ?? 0) + 1);
  }

  const variables: QuickstartVariable[] = [];

  // Documented first, in the order the Variables list gives them.
  for (const [name, { description, example }] of documented) {
    const occurrences = counts.get(name) ?? 0;
    if (occurrences === 0) {
      warnings.push({ message: `${name} is documented but never used in the template body` });
    }
    variables.push({ name, description, example, undocumented: false, occurrences });
  }

  // Then anything the body uses that the Variables list missed, so the form
  // still covers every placeholder that needs a value.
  //
  // HTML in a config value is not a placeholder; anything genuinely ambiguous
  // is resolved by listing it under "## Variables".
  for (const [name, occurrences] of counts) {
    if (documented.has(name)) continue;
    if (HTML_TAGS.has(name.slice(1, -1).toLowerCase())) continue;
    variables.push({
      name,
      description: name.replace(/^<|>$/g, '').replace(/[-_]/g, ' '),
      example: '',
      undocumented: true,
      occurrences,
    });
  }

  const undocumentedCount = variables.filter((v) => v.undocumented).length;
  if (undocumentedCount > 0) {
    warnings.push({
      message: `${undocumentedCount} placeholder${
        undocumentedCount === 1 ? ' is' : 's are'
      } used in the body but not listed under "## Variables"`,
    });
  }

  return {
    title,
    category,
    description: meta.description ?? '',
    order: Number.isFinite(order) ? order : 100,
    variables,
    body,
    warnings,
  };
}

export interface QuickstartFillResult {
  output: string;
  /** Placeholders still present because no value was supplied. */
  missing: string[];
  /** How many substitutions were made. */
  replaced: number;
}

/**
 * Substitute values into the template body. Placeholders with no value are
 * left in place rather than blanked, so the output never silently loses them.
 */
export function fillQuickstart(
  template: QuickstartTemplate,
  values: Record<string, string>,
): QuickstartFillResult {
  let output = template.body;
  let replaced = 0;
  const missing: string[] = [];

  for (const variable of template.variables) {
    const value = (values[variable.name] ?? '').trim();
    if (!value) {
      if (variable.occurrences > 0) missing.push(variable.name);
      continue;
    }
    // Split/join rather than a RegExp so `$&` and friends in a value are literal.
    const parts = output.split(variable.name);
    replaced += parts.length - 1;
    output = parts.join(value);
  }

  return { output, missing, replaced };
}
