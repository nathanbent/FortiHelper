/** Rules-file JSON parsing/serialization (same shape as add-x2.json). */
import type { Condition, Rule, RulesFile } from './types';

const isStr = (x: unknown): x is string => typeof x === 'string';

function asPairs(x: unknown): [string, string][] | null {
  if (!Array.isArray(x)) return null;
  const out: [string, string][] = [];
  for (const p of x) {
    if (!Array.isArray(p) || p.length !== 2 || !isStr(p[0]) || !isStr(p[1])) return null;
    out.push([p[0], p[1]]);
  }
  return out;
}

function asConditions(x: unknown): Condition[] | null {
  if (!Array.isArray(x)) return null;
  const out: Condition[] = [];
  for (const c of x) {
    if (!Array.isArray(c) || c.length !== 3 || !c.every(isStr)) return null;
    out.push([c[0], c[1], c[2]]);
  }
  return out;
}

function asSetOps(x: unknown): [string, string[]][] | null {
  if (!Array.isArray(x)) return null;
  const out: [string, string[]][] = [];
  for (const p of x) {
    if (!Array.isArray(p) || p.length !== 2 || !isStr(p[0])) return null;
    const vals = p[1];
    if (!Array.isArray(vals) || !vals.every(isStr)) return null;
    out.push([p[0], [...vals]]);
  }
  return out;
}

/** Parse and validate a rules JSON document; returns file or an error message. */
export function parseRulesJson(text: string): { file?: RulesFile; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { error: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { error: 'rules file must be a JSON object' };
  }
  const obj = data as Record<string, unknown>;
  if (obj.section !== undefined && !isStr(obj.section)) {
    return { error: '"section" must be a string' };
  }
  if (!Array.isArray(obj.rules)) {
    return { error: 'rules file must have a "rules" array' };
  }
  const rules: Rule[] = [];
  for (let i = 0; i < obj.rules.length; i++) {
    const raw = obj.rules[i];
    const label = `rule ${i + 1}`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { error: `${label} must be an object` };
    }
    const r = raw as Record<string, unknown>;
    const rule: Rule = {};
    if (r.where !== undefined) {
      const where = asConditions(r.where);
      if (where === null) return { error: `${label}: "where" must be a list of [field, op, value]` };
      rule.where = where;
    }
    if (r.append !== undefined) {
      const append = asPairs(r.append);
      if (append === null) return { error: `${label}: "append" must be a list of [field, value]` };
      rule.append = append;
    }
    if (r.remove !== undefined) {
      const remove = asPairs(r.remove);
      if (remove === null) return { error: `${label}: "remove" must be a list of [field, value]` };
      rule.remove = remove;
    }
    if (r.set !== undefined) {
      const set = asSetOps(r.set);
      if (set === null) return { error: `${label}: "set" must be a list of [field, [values...]]` };
      rule.set = set;
    }
    rules.push(rule);
  }
  const file: RulesFile = { rules };
  if (isStr(obj.section)) file.section = obj.section;
  return { file };
}

/** Serialize a rules file to pretty JSON (trailing newline included). */
export function serializeRulesJson(file: RulesFile): string {
  return JSON.stringify(file, null, 2) + '\n';
}
