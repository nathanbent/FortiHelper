/**
 * Quote-aware tokenizer and stack-based parser for FortiOS config / `show`
 * output. Mirrors forti-edit.py exactly: quotes are preserved on tokens, there
 * is no escape handling, and logical lines wrapped mid-token by the FortiOS
 * pager are reconstructed by raw concatenation.
 */
import type { ConfigBlock, Entry, Node, Root, Setting } from './types';

const KEYWORDS = new Set(['config', 'edit', 'set', 'unset', 'next', 'end']);

/** Split a line into tokens; a double-quoted run is one token, quotes kept. */
export function tokenize(line: string): string[] {
  const toks: string[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    while (i < n && (line[i] === ' ' || line[i] === '\t')) i++;
    if (i >= n) break;
    if (line[i] === '"') {
      let j = i + 1;
      while (j < n && line[j] !== '"') j++;
      toks.push(line.slice(i, j + 1)); // include both quotes (or run to EOL)
      i = j + 1;
    } else {
      let j = i;
      while (j < n && line[j] !== ' ' && line[j] !== '\t') j++;
      toks.push(line.slice(i, j));
      i = j;
    }
  }
  return toks;
}

/** Strip one pair of surrounding double quotes, if both are present. */
export function unq(tok: string): string {
  if (tok.length >= 2 && tok[0] === '"' && tok[tok.length - 1] === '"') {
    return tok.slice(1, -1);
  }
  return tok;
}

/** Quote a bare value FortiOS-style, unless it is already quoted. */
export function q(val: string): string {
  if (val.length >= 2 && val[0] === '"' && val[val.length - 1] === '"') return val;
  return `"${val}"`;
}

type StackItem = Root | ConfigBlock | Entry;

function isRoot(x: StackItem): x is Root {
  return !('kind' in x);
}

/**
 * Parse config text into a Root tree.
 *
 * Logical-line algorithm (parity with the Python): a line whose first word is
 * a keyword flushes the pending logical line and becomes the new pending one.
 * A non-keyword line is appended RAW (no separator, leading whitespace kept)
 * to the pending line only when we are inside a config block and the pending
 * line starts with "set " or "unset "; otherwise it is dropped as noise.
 * Blank lines are skipped; trailing \r is stripped.
 */
export function parse(text: string): Root {
  const root: Root = { blocks: [] };
  const stack: StackItem[] = [root];
  let logical: string | null = null;

  const insideConfig = (): boolean => stack.some((x) => !isRoot(x) && x.kind === 'config');

  const flush = (line: string): void => {
    const toks = tokenize(line);
    if (toks.length === 0) return;
    const kw = toks[0];
    const top = stack[stack.length - 1];

    if (kw === 'config') {
      const block: ConfigBlock = {
        kind: 'config',
        path: toks.slice(1).map(unq).join(' '),
        children: [],
      };
      if (isRoot(top)) top.blocks.push(block);
      else top.children.push(block);
      stack.push(block);
    } else if (kw === 'edit') {
      // (The Python raises on `edit` at the root; here it is dropped.)
      if (!isRoot(top)) {
        const entry: Entry = {
          kind: 'entry',
          key: toks.length > 1 ? toks[1] : '""',
          children: [],
          changedFields: [],
        };
        top.children.push(entry);
        stack.push(entry);
      }
    } else if (kw === 'next') {
      const t = stack[stack.length - 1];
      if (!isRoot(t) && t.kind === 'entry') stack.pop();
    } else if (kw === 'end') {
      const t = stack[stack.length - 1];
      if (!isRoot(t) && t.kind === 'config') stack.pop();
    } else if (kw === 'set') {
      if (toks.length >= 2 && !isRoot(top)) {
        top.children.push({ kind: 'setting', name: toks[1], values: toks.slice(2) });
      }
    } else if (kw === 'unset') {
      if (toks.length >= 2 && !isRoot(top)) {
        top.children.push({ kind: 'unset', name: toks[1] });
      }
    }
    // anything else is ignored
  };

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r+$/, '');
    const stripped = line.trim();
    if (stripped === '') continue;
    const first = stripped.split(/\s+/, 1)[0];
    if (KEYWORDS.has(first)) {
      if (logical !== null) flush(logical);
      logical = stripped;
    } else if (
      logical !== null &&
      insideConfig() &&
      (logical.startsWith('set ') || logical.startsWith('unset '))
    ) {
      logical += line; // raw concat: rebuilds mid-token pager wraps
    }
    // else: noise (banners, prompts) — dropped
  }
  if (logical !== null) flush(logical);
  return root;
}

/** Exact-path lookup of a top-level config block, e.g. "firewall policy". */
export function findBlock(root: Root, path: string): ConfigBlock | null {
  for (const b of root.blocks) {
    if (b.path === path) return b;
  }
  return null;
}

/** Direct Entry children of a block, in order. */
export function entries(block: ConfigBlock): Entry[] {
  return block.children.filter((c): c is Entry => c.kind === 'entry');
}

/**
 * Last Setting child with the given name (Python builds a dict, so a later
 * duplicate wins), or null.
 */
export function getSetting(container: Entry | ConfigBlock, name: string): Setting | null {
  let found: Setting | null = null;
  for (const c of container.children as Node[]) {
    if (c.kind === 'setting' && c.name === name) found = c;
  }
  return found;
}

/** Unquoted first value of the entry's `name` setting, if any. */
export function entryName(entry: Entry): string | undefined {
  const s = getSetting(entry, 'name');
  if (s && s.values.length > 0) return unq(s.values[0]);
  return undefined;
}
