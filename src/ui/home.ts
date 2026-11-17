import type { Tool } from '../types';
import { TOOL_GROUPS } from '../lib/tool-groups';
import { el } from './components';

export const homeTool: Tool = {
  id: 'home',
  title: 'Home',
  description: 'Browser-based generators for FortiGate CLI config. Nothing you paste leaves the page.',
  mount(container) {
    for (const group of TOOL_GROUPS) {
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
