/** AST + rule types for the Forti Edit tool (port of forti-edit.py). */

/** A `set <name> <values...>` line. Value tokens keep their quoting as pasted. */
export interface Setting {
  kind: 'setting';
  name: string;
  values: string[];
}

/** An `unset <name>` line. */
export interface UnsetLine {
  kind: 'unset';
  name: string;
}

/** An `edit <key> ... next` block. */
export interface Entry {
  kind: 'entry';
  /** Raw key token, e.g. '30' or '"name"'. */
  key: string;
  children: Node[];
  /** Names of settings modified during the current applyRules run. */
  changedFields: string[];
}

/** A `config <path> ... end` block. */
export interface ConfigBlock {
  kind: 'config';
  /** Unquoted path, e.g. 'firewall policy'. */
  path: string;
  children: Node[];
}

export type Node = Setting | UnsetLine | Entry | ConfigBlock;

export interface Root {
  /** Top-level config blocks, in input order. */
  blocks: ConfigBlock[];
}

export const MATCH_OPS = ['contains', 'not-contains', 'equals', 'exists', 'absent'] as const;
export type MatchOp = (typeof MATCH_OPS)[number];

/** [field, op, value] — op should be a MatchOp; kept as plain strings for JSON parity. */
export type Condition = [string, string, string];

/** One rule, same shape as an element of the rules-file "rules" array. */
export interface Rule {
  where?: Condition[];
  append?: [string, string][];
  remove?: [string, string][];
  set?: [string, string[]][];
}

/** The rules-file JSON document ({section?, rules}). */
export interface RulesFile {
  section?: string;
  rules: Rule[];
}
