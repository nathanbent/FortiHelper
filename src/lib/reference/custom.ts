/**
 * Sheets a reader adds in the browser.
 *
 * Same markdown format as the bundled sheets under content/reference/, kept
 * in that browser's localStorage and never uploaded or committed: a way to
 * try a sheet before adding it to the repo, or to keep a private one.
 *
 * Nothing here touches storage or the DOM. The UI hands in the stored
 * markdown and gets back what to show and what to store.
 */

import { parseSheet, type ParsedSheet } from './markdown';

/** A reader's own sheet: parsed, with the markdown it came from. */
export type CustomSheet = ParsedSheet & { markdown: string };

/** A stored sheet that no longer parses, kept so it can be fixed or removed. */
export interface CustomSheetError {
  markdown: string;
  message: string;
}

/**
 * Parse stored sheets. One that fails, or whose id collides with a bundled
 * sheet or an earlier one of the reader's own, is reported, not dropped.
 */
export function parseCustomSheets(
  markdowns: string[],
  bundledIds: ReadonlySet<string>,
): { sheets: CustomSheet[]; errors: CustomSheetError[] } {
  const sheets: CustomSheet[] = [];
  const errors: CustomSheetError[] = [];
  for (const markdown of markdowns) {
    try {
      const sheet = parseSheet(markdown, 'your sheet');
      if (bundledIds.has(sheet.id)) {
        throw new Error(`id "${sheet.id}" is already used by a built-in sheet: change the id`);
      }
      if (sheets.some((s) => s.id === sheet.id)) {
        throw new Error(`id "${sheet.id}" is used by another of your sheets`);
      }
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(sheet.id)) {
        throw new Error(`id "${sheet.id}" must be lowercase letters, digits and hyphens`);
      }
      sheets.push({ ...sheet, markdown });
    } catch (error) {
      errors.push({ markdown, message: (error as Error).message.replace(/^your sheet: /, '') });
    }
  }
  return { sheets, errors };
}

export type AddResult =
  | { ok: true; list: string[]; id: string; replaced: boolean }
  | { ok: false; error: string };

/**
 * Add a sheet to the stored list. A sheet with the same id as one already
 * there replaces it, which is how an edit is saved.
 */
export function addCustomSheet(
  existing: string[],
  markdown: string,
  bundledIds: ReadonlySet<string>,
): AddResult {
  const text = markdown.trim();
  if (!text) return { ok: false, error: 'Paste a sheet first.' };

  const { sheets, errors } = parseCustomSheets([text], bundledIds);
  if (errors.length) return { ok: false, error: errors[0].message };
  const { id } = sheets[0];

  // Find an existing sheet with this id among the ones that still parse.
  const at = existing.findIndex((stored) => {
    try {
      return parseSheet(stored).id === id;
    } catch {
      return false;
    }
  });
  const list = [...existing];
  if (at === -1) list.push(text);
  else list[at] = text;
  return { ok: true, list, id, replaced: at !== -1 };
}

/** A complete sheet to start from, shown by "Insert example". */
export const EXAMPLE_SHEET = `---
id: my-first-sheet
title: My first sheet
topic: general
kind: diagnostics
---

A sentence on when to use this sheet.

\`get system status\` - What the command shows
> What to look for in its output
\`execute ping <dest-ip>\` - A placeholder becomes a fill-in field

### A config block

\`\`\`
config system global
    set hostname "<hostname>"
end
\`\`\`
`;
