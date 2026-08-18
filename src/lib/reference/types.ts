/**
 * Reference content model.
 *
 * Topics and kinds are declared once, as data, and their types are derived
 * from those lists — adding a new topic or kind is a one-line change here,
 * with the compiler then pointing at anything that needs updating.
 */

/** Topic filter options, in dropdown order. */
export const REFERENCE_TOPICS = [
  { value: 'ipsec', label: 'IPsec VPN' },
  { value: 'saml', label: 'SAML / SSO' },
  { value: 'fortiswitch', label: 'FortiSwitch' },
  { value: 'webfilter', label: 'Web filter' },
  { value: 'general', label: 'General' },
] as const;

/** Kind filter options, in dropdown order. */
export const REFERENCE_KINDS = [
  { value: 'diagnostics', label: 'Diagnostics' },
  { value: 'config', label: 'Config templates' },
  { value: 'table', label: 'Reference tables' },
] as const;

/** What a section is about. */
export type ReferenceTopic = (typeof REFERENCE_TOPICS)[number]['value'];

/** What kind of material a section holds. */
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]['value'];

/** One row in a reference section. */
export interface ReferenceEntry {
  /** A copyable CLI command (rendered in <code> with a Copy button). */
  command?: string;
  /** Plain (non-command) text, e.g. a color id (rendered in <code>, no Copy button). */
  text?: string;
  /** Short human description shown next to the command/text. */
  description?: string;
  /** FortiGate color id — renders a swatch beside the row. */
  swatch?: number;
}

/** A multi-line config block, copied as a whole. */
export interface ReferenceSnippet {
  title: string;
  description?: string;
  /** The config text, copied verbatim. */
  body: string;
}

/** A titled group of reference entries or snippets. */
export interface ReferenceSection {
  /** Unique across all sections; used as the DOM id and the open-state key. */
  id: string;
  title: string;
  topic: ReferenceTopic;
  kind: ReferenceKind;
  /** Optional note shown under the section title. */
  description?: string;
  entries?: ReferenceEntry[];
  snippets?: ReferenceSnippet[];
  /**
   * When true, the section's commands form a sequence and the UI offers a
   * "Copy all" button that copies every `command` joined by newlines.
   */
  copyAll?: boolean;
}

/** Human label for a topic value. */
export function topicLabel(topic: ReferenceTopic): string {
  return REFERENCE_TOPICS.find((t) => t.value === topic)?.label ?? topic;
}

/** Human label for a kind value. */
export function kindLabel(kind: ReferenceKind): string {
  return REFERENCE_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** How many rows and snippets a section holds, for the collapsed summary. */
export function sectionItemCount(section: ReferenceSection): number {
  return (section.entries?.length ?? 0) + (section.snippets?.length ?? 0);
}
