/**
 * JSON export of the reference sheets and quickstart templates.
 *
 * The content lives as markdown under content/, in a format only this app's
 * parsers read. The build also writes it out as two plain JSON files next to
 * the site, so another project, script or language can use the same content
 * by fetching one URL, with no parser of its own:
 *
 *     <site>/reference.json    every reference sheet, plus topics and variables
 *     <site>/templates.json    every committed quickstart template
 *
 * Nothing here touches the filesystem or the DOM: callers hand in the
 * markdown, so the same code runs in the Vite build and in the tests.
 *
 * `version` changes only when a field is renamed or removed; new fields can
 * appear without it changing, so readers should ignore keys they do not know.
 */

import { TEMPLATE_CATEGORIES, parseQuickstart } from './quickstart';
import { parseSheets } from './reference/markdown';
import {
  REFERENCE_KINDS,
  REFERENCE_TOPICS,
  RUN_ON,
  VARIABLE_TYPES,
  type ReferenceSection,
  type ReferenceVariable,
} from './reference/types';
import { parseVariableCatalog, sectionPlaceholders } from './reference/variables';

export const EXPORT_VERSION = 1;

export interface ReferenceExport {
  format: 'fortihelper-reference';
  version: number;
  topics: readonly { value: string; label: string }[];
  kinds: readonly { value: string; label: string }[];
  runOn: readonly { value: string; label: string }[];
  variableTypes: readonly string[];
  /** The shared catalogue: labels, examples and types for placeholders. */
  variables: ReferenceVariable[];
  /** Every sheet, in display order. */
  sheets: (ReferenceSection & {
    order: number;
    /** Every `<placeholder>` the sheet's commands and blocks use. */
    placeholders: string[];
  })[];
}

export interface TemplatesExport {
  format: 'fortihelper-templates';
  version: number;
  categories: readonly { value: string; label: string }[];
  templates: {
    /** Filename without its extension. */
    id: string;
    title: string;
    category: string;
    description: string;
    order: number;
    variables: { name: string; description: string; example: string }[];
    /** The config text, with `<placeholder>`s still in it. */
    body: string;
  }[];
}

/** Private templates are gitignored for a reason: never let one be published. */
function refusePrivate(paths: string[]): void {
  const leaked = paths.find((p) => /(^|[\\/])private[\\/]/.test(p));
  if (leaked) throw new Error(`refusing to export a private file: ${leaked}`);
}

/**
 * @param sheets    reference sheets, markdown keyed by path or filename
 * @param catalogue the text of content/reference-variables.md
 */
export function buildReferenceExport(
  sheets: Record<string, string>,
  catalogue: string,
): ReferenceExport {
  refusePrivate(Object.keys(sheets));
  return {
    format: 'fortihelper-reference',
    version: EXPORT_VERSION,
    topics: REFERENCE_TOPICS,
    kinds: REFERENCE_KINDS,
    runOn: RUN_ON,
    variableTypes: VARIABLE_TYPES,
    variables: parseVariableCatalog(catalogue),
    sheets: parseSheets(sheets).map((sheet) => ({
      ...sheet,
      placeholders: sectionPlaceholders(sheet),
    })),
  };
}

/** @param templates quickstart templates, markdown keyed by path or filename */
export function buildTemplatesExport(templates: Record<string, string>): TemplatesExport {
  refusePrivate(Object.keys(templates));
  const categoryRank = new Map<string, number>(TEMPLATE_CATEGORIES.map((c, i) => [c.value, i]));
  return {
    format: 'fortihelper-templates',
    version: EXPORT_VERSION,
    categories: TEMPLATE_CATEGORIES,
    templates: Object.entries(templates)
      .map(([path, markdown]) => {
        const parsed = parseQuickstart(markdown);
        return {
          id: (path.split(/[\\/]/).pop() ?? path).replace(/\.md$/, ''),
          title: parsed.title,
          category: parsed.category,
          description: parsed.description,
          order: parsed.order,
          variables: parsed.variables.map(({ name, description, example }) => ({
            name,
            description,
            example,
          })),
          body: parsed.body,
        };
      })
      .sort(
        (a, b) =>
          categoryRank.get(a.category)! - categoryRank.get(b.category)! ||
          a.order - b.order ||
          a.title.localeCompare(b.title),
      ),
  };
}
