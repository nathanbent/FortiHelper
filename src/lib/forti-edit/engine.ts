/** Matching and mutation engine — port of matches/do_append/do_remove/do_set/apply_rules. */
import { entries, entryName, getSetting, q, unq } from './parser';
import type { Condition, ConfigBlock, Entry, Rule } from './types';

/** All conditions AND-ed; comparison is on unquoted literal tokens. */
export function matches(entry: Entry, conditions: Condition[]): boolean {
  for (const [field, op, value] of conditions) {
    const s = getSetting(entry, field);
    const present = s ? s.values.map(unq) : [];
    const v = unq(value);
    if (op === 'contains') {
      if (!present.includes(v)) return false;
    } else if (op === 'not-contains') {
      if (present.includes(v)) return false;
    } else if (op === 'equals') {
      if (!(present.length === 1 && present[0] === v)) return false;
    } else if (op === 'exists') {
      if (s === null) return false;
    } else if (op === 'absent') {
      if (s !== null) return false;
    } else {
      throw new Error(`unknown match op: ${op}`);
    }
  }
  return true;
}

/** Append value to a multi-value field; idempotent. Returns true if changed. */
export function doAppend(entry: Entry, field: string, value: string): boolean {
  const s = getSetting(entry, field);
  const v = unq(value);
  if (s === null) {
    entry.children.push({ kind: 'setting', name: field, values: [q(value)] });
    entry.changedFields.push(field);
    return true;
  }
  if (s.values.map(unq).includes(v)) return false; // idempotent
  s.values.push(q(value));
  entry.changedFields.push(field);
  return true;
}

/** Remove every occurrence of value from the field. Returns true if changed. */
export function doRemove(entry: Entry, field: string, value: string): boolean {
  const s = getSetting(entry, field);
  if (s === null) return false;
  const v = unq(value);
  const keep = s.values.filter((x) => unq(x) !== v);
  if (keep.length === s.values.length) return false;
  s.values = keep;
  entry.changedFields.push(field);
  return true;
}

/** Replace the field's value list wholesale. Returns true if changed. */
export function doSet(entry: Entry, field: string, values: string[]): boolean {
  const next = values.map(q);
  const s = getSetting(entry, field);
  if (s !== null && s.values.length === next.length && s.values.every((x, i) => x === next[i])) {
    return false;
  }
  if (s === null) entry.children.push({ kind: 'setting', name: field, values: next });
  else s.values = next;
  entry.changedFields.push(field);
  return true;
}

/**
 * Apply rules to the block's entries. Resets changedFields first, then applies
 * each rule to each matching entry (append, then remove, then set, like the
 * Python). Returns changed entries in first-touch order.
 */
export function applyRules(block: ConfigBlock, rules: Rule[]): Entry[] {
  const changed: Entry[] = [];
  for (const entry of entries(block)) entry.changedFields = [];
  for (const rule of rules) {
    const conds = rule.where ?? [];
    for (const entry of entries(block)) {
      if (!matches(entry, conds)) continue;
      let hit = false;
      for (const [f, v] of rule.append ?? []) hit = doAppend(entry, f, v) || hit;
      for (const [f, v] of rule.remove ?? []) hit = doRemove(entry, f, v) || hit;
      for (const [f, vals] of rule.set ?? []) hit = doSet(entry, f, vals) || hit;
      if (hit && !changed.includes(entry)) changed.push(entry);
    }
  }
  return changed;
}

/** Dry-run result for one rule (was the --dry-run stderr report). */
export interface DryRunMatch {
  conditions: Condition[];
  entries: { key: string; name?: string }[];
}

/** Per-rule match lists against the current (unmutated) block state. */
export function dryRun(block: ConfigBlock, rules: Rule[]): DryRunMatch[] {
  return rules.map((rule) => {
    const conds = rule.where ?? [];
    const hits = entries(block).filter((e) => matches(e, conds));
    return {
      conditions: conds,
      entries: hits.map((e) => ({ key: e.key, name: entryName(e) })),
    };
  });
}
