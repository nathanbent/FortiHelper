/** Forti Edit — bulk query-and-edit for FortiOS config, port of forti-edit.py. */
import { applyRules, dryRun } from './engine';
import { emitDelta, emitFullBlock } from './emit';
import { entryName, findBlock, parse } from './parser';
import type { Rule } from './types';

export {
  MATCH_OPS,
  type Condition,
  type ConfigBlock,
  type Entry,
  type MatchOp,
  type Node,
  type Root,
  type Rule,
  type RulesFile,
  type Setting,
  type UnsetLine,
} from './types';
export { entries, entryName, findBlock, getSetting, parse, q, tokenize, unq } from './parser';
export {
  applyRules,
  doAppend,
  doRemove,
  doSet,
  dryRun,
  matches,
  type DryRunMatch,
} from './engine';
export { emitDelta, emitFullBlock, emitSetting } from './emit';
export { parseRulesJson, serializeRulesJson } from './rules';

export type OutputMode = 'delta' | 'full';

/** One changed entry, for the change summary (was per-entry stderr lines). */
export interface ChangedEntry {
  key: string;
  name?: string;
  /** Changed field names, deduped, first-seen order. */
  fields: string[];
}

export interface EditResult {
  /** Pasteable config; '' when nothing changed. Includes the trailing newline
   * the Python print() adds, so it compares equal to captured stdout. */
  output: string;
  changed: ChangedEntry[];
  /** Human-readable change summary (was the stderr report). */
  summary: string;
  /** Set when the section was not found; output is then empty. */
  error?: string;
}

/** The "Changed N entr(y|ies) in '<section>'" summary line. */
export function changeSummary(count: number, section: string): string {
  let s = `Changed ${count} ${count === 1 ? 'entry' : 'entries'} in '${section}'`;
  if (count === 0) s += '; nothing to do, no config emitted';
  return s;
}

/** Parse, apply rules to the named section, and emit — the whole CLI run. */
export function runFortiEdit(
  text: string,
  section: string,
  rules: Rule[],
  mode: OutputMode = 'delta',
): EditResult {
  const root = parse(text);
  const block = findBlock(root, section);
  if (block === null) {
    return {
      output: '',
      changed: [],
      summary: '',
      error: `section '${section}' not found in input`,
    };
  }
  const changedEntries = applyRules(block, rules);
  const changed: ChangedEntry[] = changedEntries.map((e) => ({
    key: e.key,
    name: entryName(e),
    fields: [...new Set(e.changedFields)],
  }));
  const summary = changeSummary(changed.length, section);
  if (changed.length === 0) return { output: '', changed, summary };
  const body = mode === 'full' ? emitFullBlock(block) : emitDelta(block, changedEntries);
  return { output: body + '\n', changed, summary };
}

/** Dry-run against a text input; per-rule match lists, or a section error. */
export function dryRunFortiEdit(
  text: string,
  section: string,
  rules: Rule[],
): { matches?: ReturnType<typeof dryRun>; error?: string } {
  const block = findBlock(parse(text), section);
  if (block === null) return { error: `section '${section}' not found in input` };
  return { matches: dryRun(block, rules) };
}
