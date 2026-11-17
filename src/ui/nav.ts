import type { PageId } from '../lib/help';
import { TOOL_GROUPS } from '../lib/tool-groups';
import { el } from './components';

/** The header nav, and the hook the router calls when the page changes. */
export interface ShellNav {
  element: HTMLElement;
  setActive(id: PageId): void;
}

const MENU_LABEL = 'Tools';

/**
 * Header navigation: the one tool that stays a click away, and a Tools menu
 * holding every page, grouped the way the Home page groups them.
 *
 * `titles` gives the name of every page, for the menu button to show which
 * page is open. `pinned` is the tool that also gets its own link.
 */
export function shellNav(titles: Map<PageId, string>, pinned: PageId): ShellNav {
  const nav = el('nav', 'shell-nav');
  nav.setAttribute('aria-label', 'Tools');
  const links = new Map<PageId, HTMLAnchorElement[]>();

  const link = (id: PageId, className: string | undefined, text?: string) => {
    const a = el('a', className, text);
    a.href = `#/${id}`;
    links.set(id, [...(links.get(id) ?? []), a]);
    return a;
  };

  const pinnedLink = link(pinned, 'nav-pinned', titles.get(pinned));

  const menu = el('div', 'nav-menu');
  const button = el('button', 'nav-menu-button');
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'nav-menu-panel');
  const buttonLabel = el('span', undefined, MENU_LABEL);
  const caret = el('span', 'nav-caret');
  caret.setAttribute('aria-hidden', 'true');
  button.append(buttonLabel, caret);

  const panel = el('div', 'nav-menu-panel');
  panel.id = 'nav-menu-panel';
  panel.hidden = true;

  const groups = el('div', 'nav-menu-groups');
  for (const group of TOOL_GROUPS) {
    const section = el('section', 'nav-menu-group');
    section.append(el('h2', 'nav-menu-heading', group.title));
    for (const tool of group.tools) {
      const a = link(tool.id, 'nav-menu-item');
      a.append(el('span', 'nav-menu-name', tool.name), el('span', 'nav-menu-what', tool.what));
      section.append(a);
    }
    groups.append(section);
  }

  const foot = el('div', 'nav-menu-foot');
  foot.append(link('home', undefined, 'All tools'), link('about', undefined, 'About & changelog'));

  panel.append(groups, foot);
  menu.append(button, panel);
  nav.append(pinnedLink, menu);

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };

  button.addEventListener('click', () => setOpen(panel.hidden));
  // Following a link closes the menu, including the link to the open page,
  // which fires no hashchange.
  panel.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) setOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target as Node)) setOpen(false);
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || panel.hidden) return;
    setOpen(false);
    button.focus();
  });
  // Tabbing out of the menu closes it rather than leaving it over the page.
  menu.addEventListener('focusout', (e) => {
    const next = e.relatedTarget as Node | null;
    if (next && !menu.contains(next)) setOpen(false);
  });

  return {
    element: nav,
    setActive(id) {
      for (const [tid, anchors] of links) {
        for (const a of anchors) {
          a.classList.toggle('active', tid === id);
          if (tid === id) a.setAttribute('aria-current', 'page');
          else a.removeAttribute('aria-current');
        }
      }
      // The button names the open page, so the header always says where you
      // are. Home and the pinned tool already have their own marker.
      const named = id !== 'home' && id !== pinned;
      buttonLabel.textContent = named ? (titles.get(id) ?? MENU_LABEL) : MENU_LABEL;
      button.classList.toggle('active', named);
      setOpen(false);
    },
  };
}
