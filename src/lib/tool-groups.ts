import type { PageId } from './help';

/** One tool as the launchers describe it. */
export interface ToolEntry {
  id: PageId;
  name: string;
  /** One line on what goes in and what comes out. */
  what: string;
}

export interface ToolGroup {
  title: string;
  blurb: string;
  tools: ToolEntry[];
}

/**
 * The tools grouped by what you are trying to do. The Home page and the
 * header's Tools menu are both built from this list, so a new tool is added
 * here once and shows up in both.
 */
export const TOOL_GROUPS: ToolGroup[] = [
  {
    title: 'Build config',
    blurb: 'Start from a list and get CLI you can paste.',
    tools: [
      {
        id: 'object-helper',
        name: 'Object Helper',
        what: 'FQDNs, IPs, CIDRs, and ranges into address objects and groups.',
      },
      {
        id: 'webfilter',
        name: 'Webfilter Generator',
        what: 'A domain list into a static URL filter, with wildcards detected.',
      },
      {
        id: 'content-filter',
        name: 'Content Filter',
        what: 'A banned-word list into a scored web content filter.',
      },
      {
        id: 'onboarding',
        name: 'Switch & AP Onboarding',
        what: 'A CSV, XLSX, or pasted list of FortiSwitch and FortiAP serials into batched config that names, groups, and approves them.',
      },
    ],
  },
  {
    title: 'Change config',
    blurb: 'Work on config you already have.',
    tools: [
      {
        id: 'forti-edit',
        name: 'Forti Edit',
        what: 'Bulk-edit an existing config: set, append, or remove across many objects.',
      },
      {
        id: 'interface-range',
        name: 'Interface Range',
        what: 'Like Cisco’s interface range: type commands once and apply them to port1-port20 or any list of ports.',
      },
    ],
  },
  {
    title: 'Look things up',
    blurb: 'The commands you reach for when something is broken.',
    tools: [
      {
        id: 'reference',
        name: 'Reference',
        what: 'Diagnostic cheat sheets, config snippets, and the colour-ID table.',
      },
    ],
  },
  {
    title: 'Start from a template',
    blurb: 'Whole config sets built from one form.',
    tools: [
      {
        id: 'quickstart',
        name: 'Templates',
        what: 'Fill in a site’s details and get the whole config: use a built-in example or bring your own template.',
      },
    ],
  },
];
