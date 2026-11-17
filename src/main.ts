import './styles.css';
import type { Tool } from './types';
import { el } from './ui/components';
import { helpPanel } from './ui/help';
import { shellNav } from './ui/nav';
import { applyTheme, loadTheme, themePicker } from './ui/theme';
import { objectHelperTool } from './ui/object-helper';
import { homeTool } from './ui/home';
import { quickstartTool } from './ui/quickstart-tool';
import { webfilterTool } from './ui/webfilter';
import { webfilterContentTool } from './ui/webfilter-content';
import { fortiEditTool } from './ui/forti-edit';
import { interfaceRangeTool } from './ui/interface-range';
import { deviceOnboardingTool } from './ui/device-onboarding';
import { referenceTool } from './ui/reference';
import { aboutTool } from './ui/about';

// Every page the router knows. The header menu and the Home page take their
// order and grouping from TOOL_GROUPS, not from this list.
const tools: Tool[] = [
  homeTool,
  objectHelperTool,
  webfilterTool,
  webfilterContentTool,
  deviceOnboardingTool,
  fortiEditTool,
  interfaceRangeTool,
  referenceTool,
  quickstartTool,
  aboutTool,
];

const app = document.getElementById('app')!;

const header = el('header', 'shell-header');
const title = el('h1');
const brand = el('a', 'shell-brand', '\u{1F6E1}\uFE0F FortiHelper');
brand.href = `#/${homeTool.id}`;
title.append(brand, el('span', 'beta', 'beta'));
// Object Helper is the one tool with its own link; the rest sit in the menu.
const nav = shellNav(new Map(tools.map((t) => [t.id, t.title])), objectHelperTool.id);
header.append(title, nav.element, themePicker());

// The inline script in index.html already set this for the first paint; re-apply
// so a stored preference survives a cleared or rewritten attribute.
applyTheme(loadTheme());

const main = el('main', 'tool-main');
const footer = el('footer', 'shell-footer');
footer.innerHTML =
  'Runs entirely in your browser: nothing you paste leaves this page ' +
  '(except optional DNS lookups via DNS-over-HTTPS).<br>' +
  `FortiHelper v${__APP_VERSION__} \u00B7 <a href="#/${aboutTool.id}">About</a> \u00B7 ` +
  `<a href="${__REPO_URL__}" target="_blank" rel="noopener">Source</a>`;

app.append(header, main, footer);

/** `#/tool/param` -> the tool id and whatever follows it. */
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
  nav.setActive(tool.id);
  main.replaceChildren();
  const heading = el('div');
  heading.append(el('h2', undefined, tool.title), el('p', 'tool-desc', tool.description));
  const help = helpPanel(tool.id);
  if (help) heading.append(help);
  main.append(heading);
  const container = el('div');
  main.append(container);
  tool.mount(container, param || undefined);
}

window.addEventListener('hashchange', render);
render();
