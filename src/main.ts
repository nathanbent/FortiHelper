import './styles.css';
import type { Tool } from './types';
import { el } from './ui/components';
import { applyTheme, loadTheme, themePicker } from './ui/theme';
import { objectHelperTool } from './ui/object-helper';
import { homeTool } from './ui/home';
import { quickstartTool } from './ui/quickstart-tool';
import { webfilterTool } from './ui/webfilter';
import { webfilterContentTool } from './ui/webfilter-content';
import { fortiEditTool } from './ui/forti-edit';
import { referenceTool } from './ui/reference';

// Nav order: home, then the generators in the order you would reach for
// them, then the editor, then the lookup tab, with templates last.
const tools: Tool[] = [
  homeTool,
  objectHelperTool,
  webfilterTool,
  webfilterContentTool,
  fortiEditTool,
  referenceTool,
  quickstartTool,
];

const app = document.getElementById('app')!;

const header = el('header', 'shell-header');
const title = el('h1');
title.append(document.createTextNode('🛡️ FortiHelper'), el('span', 'beta', 'beta'));
const nav = el('nav', 'shell-nav');
header.append(title, nav, themePicker());

// The inline script in index.html already set this for the first paint; re-apply
// so a stored preference survives a cleared or rewritten attribute.
applyTheme(loadTheme());

const main = el('main', 'tool-main');
const footer = el('footer', 'shell-footer');
footer.innerHTML =
  'Runs entirely in your browser — nothing you paste leaves this page ' +
  '(except optional DNS lookups via DNS-over-HTTPS). ' +
  `<a href="${__REPO_URL__}" target="_blank" rel="noopener">Source</a>`;

app.append(header, main, footer);

// A hairline after these tabs splits the bar into:
// home | build | work with | templates.
const NAV_BREAKS = new Set(['home', 'content-filter', 'reference']);

const links = new Map<string, HTMLAnchorElement>();
for (const tool of tools) {
  const a = el('a', undefined, tool.title);
  a.href = `#/${tool.id}`;
  links.set(tool.id, a);
  nav.append(a);
  if (NAV_BREAKS.has(tool.id)) nav.append(el('span', 'nav-sep'));
}

/** `#/tool/param` → the tool id and whatever follows it. */
function currentRoute(): { id: string; param?: string } {
  const path = location.hash.replace(/^#\//, '');
  const slash = path.indexOf('/');
  const id = slash === -1 ? path : path.slice(0, slash);
  const param = slash === -1 ? undefined : path.slice(slash + 1);
  return tools.some((t) => t.id === id) ? { id, param } : { id: tools[0].id };
}

function render() {
  const { id, param } = currentRoute();
  const tool = tools.find((t) => t.id === id)!;
  for (const [tid, a] of links) a.classList.toggle('active', tid === id);
  main.replaceChildren();
  const heading = el('div');
  heading.append(el('h2', undefined, tool.title), el('p', 'tool-desc', tool.description));
  main.append(heading);
  const container = el('div');
  main.append(container);
  tool.mount(container, param || undefined);
}

window.addEventListener('hashchange', render);
render();
