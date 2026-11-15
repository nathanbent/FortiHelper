/**
 * Reference-tab content.
 *
 * Sheets are markdown files under content/reference/; see the format in
 * ./markdown.ts and the walkthrough in the README. Adding one means adding a
 * file; nothing here changes.
 *
 * `tests/reference.test.ts` guards the shape of everything here.
 */

import type { ReferenceSection, ReferenceVariable } from './types';
import { loadSharedVariables, loadSheets } from './markdown';

export * from './types';
export { parseSheet } from './markdown';
export * from './variables';
export * from './versions';

/** All reference sections, in display order. */
export const referenceSections: ReferenceSection[] = loadSheets();

/** Labels, examples and types for placeholders, shared by every sheet. */
export const sharedVariables: Map<string, ReferenceVariable> = loadSharedVariables();
