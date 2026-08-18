import type { Tool } from '../types';
import { el } from './components';

/**
 * Launcher groups. Each entry points at a tool by id, so the nav order and
 * this page can differ — the home page groups by what you are trying to do,
 * the nav is a flat list.
 */
const GROUPS: { title: string; blurb: string; tools: { id: string; name: string; what: string }[] }[] = [
  {
    title: 'Build config',
    blurb: 'Start from a list or a template and get CLI you can paste.',
    tools: [
      {
        id: 'quickstart',
        name: 'Templates',
        what: 'Fill in a site’s details and get a whole build-out, VPN, or policy set.',
      },
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
];

export const homeTool: Tool = {
  id: 'home',
  title: 'Home',
  description: 'Browser-based generators for FortiGate CLI config. Nothing you paste leaves the page.',
  mount(container) {
    for (const group of GROUPS) {
      // No panel wrapper: the cards already carry a border, and boxing a
      // one-card group inside a full-width panel leaves a lot of dead space.
      const section = el('section', 'home-group');
      section.append(el('h2', 'home-group-title', group.title));
      section.append(el('p', 'ref-note', group.blurb));

      const grid = el('div', 'tpl-grid');
      for (const tool of group.tools) {
        const card = el('a', 'tpl-card');
        card.href = `#/${tool.id}`;
        const head = el('div', 'tpl-card-head');
        head.append(el('span', 'tpl-card-title', tool.name));
        card.append(head);
        card.append(el('p', 'tpl-card-desc', tool.what));
        grid.append(card);
      }
      section.append(grid);
      container.append(section);
    }
  },
};
