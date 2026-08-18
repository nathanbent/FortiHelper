/** Emitters — byte-identical to the Python emit_full_block / emit_delta. */
import { getSetting } from './parser';
import type { ConfigBlock, Entry, Node, Setting } from './types';

const INDENT = '    ';

export function emitSetting(s: Setting, depth: number): string {
  const tail = s.values.length > 0 ? ' ' + s.values.join(' ') : '';
  return `${INDENT.repeat(depth)}set ${s.name}${tail}`;
}

/** The whole section rebuilt: every entry, every field, nested blocks kept. */
export function emitFullBlock(block: ConfigBlock): string {
  const out: string[] = [`config ${block.path}`];
  for (const child of block.children) {
    if (child.kind === 'entry') {
      out.push(`${INDENT}edit ${child.key}`);
      out.push(...emitChildren(child.children, 2));
      out.push(`${INDENT}next`);
    } else if (child.kind === 'setting') {
      out.push(emitSetting(child, 1));
    } else if (child.kind === 'unset') {
      out.push(`${INDENT}unset ${child.name}`);
    }
  }
  out.push('end');
  return out.join('\n');
}

function emitChildren(children: Node[], depth: number): string[] {
  const lines: string[] = [];
  for (const c of children) {
    if (c.kind === 'setting') {
      lines.push(emitSetting(c, depth));
    } else if (c.kind === 'unset') {
      lines.push(`${INDENT.repeat(depth)}unset ${c.name}`);
    } else if (c.kind === 'config') {
      lines.push(`${INDENT.repeat(depth)}config ${c.path}`);
      for (const e of c.children) {
        if (e.kind === 'entry') {
          lines.push(`${INDENT.repeat(depth + 1)}edit ${e.key}`);
          lines.push(...emitChildren(e.children, depth + 2));
          lines.push(`${INDENT.repeat(depth + 1)}next`);
        } else {
          lines.push(...emitChildren([e], depth + 1));
        }
      }
      lines.push(`${INDENT.repeat(depth)}end`);
    }
  }
  return lines;
}

/**
 * Only the touched entries, only their changed fields (deduped, first-seen
 * order); a changed field whose setting no longer exists becomes `unset`.
 */
export function emitDelta(block: ConfigBlock, changedEntries: Entry[]): string {
  const out: string[] = [`config ${block.path}`];
  for (const e of changedEntries) {
    out.push(`${INDENT}edit ${e.key}`);
    const seen: string[] = [];
    for (const f of e.changedFields) {
      if (seen.includes(f)) continue;
      seen.push(f);
      const s = getSetting(e, f);
      if (s === null) out.push(`${INDENT.repeat(2)}unset ${f}`);
      else out.push(emitSetting(s, 2));
    }
    out.push(`${INDENT}next`);
  }
  out.push('end');
  return out.join('\n');
}
