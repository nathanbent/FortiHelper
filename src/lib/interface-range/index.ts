/**
 * Interface Range: the FortiOS stand-in for Cisco's `interface range`.
 *
 * FortiOS has no range command, so the same commands are repeated inside an
 * `edit` block for every interface. This module expands a range list such as
 * `port1-port8,port10-11` into interface names and wraps the commands in the
 * config section the chosen target uses.
 */
import type { Warning } from '../../types';

/**
 * Where the interfaces live.
 *
 * - `fortigate`:      the FortiGate's own ports, `config system interface`.
 * - `managed-switch`: FortiLink-managed FortiSwitch ports, configured from the
 *                     FortiGate under `config switch-controller managed-switch`.
 * - `fortiswitch`:    a standalone FortiSwitch's CLI, `config switch interface`.
 */
export type RangeTarget = 'fortigate' | 'managed-switch' | 'fortiswitch';

export const TARGET_LABELS: Record<RangeTarget, string> = {
  fortigate: 'FortiGate interfaces (config system interface)',
  'managed-switch': 'FortiLink switch ports (from the FortiGate)',
  fortiswitch: 'Standalone FortiSwitch (config switch interface)',
};

/** Largest number of interfaces one range may expand to. */
export const MAX_RANGE = 1024;

const INDENT = '    ';

export interface ExpandResult {
  names: string[];
  warnings: Warning[];
}

/** `port12` -> prefix `port`, digits `12`; undefined without trailing digits. */
function splitTrailingNumber(name: string): { prefix: string; digits: string } | undefined {
  const m = /^(.*?)(\d+)$/.exec(name);
  return m ? { prefix: m[1], digits: m[2] } : undefined;
}

interface ParsedRange {
  prefix: string;
  start: number;
  end: number;
  /** Zero-padding width, when the start was written with a leading zero. */
  width: number;
}

/**
 * Read one token as a range, or return undefined for a plain name.
 *
 * Every `-` is tried as the split point, so names that contain a hyphen
 * (`1-P1-1-P4` on a chassis) still work. The end may repeat the prefix
 * (`port1-port8`) or give only the number (`port1-8`).
 */
function parseRange(token: string): ParsedRange | undefined {
  for (let i = token.indexOf('-'); i > 0; i = token.indexOf('-', i + 1)) {
    const left = splitTrailingNumber(token.slice(0, i));
    const rightText = token.slice(i + 1);
    if (!left || rightText === '') continue;
    let endDigits: string | undefined;
    if (/^\d+$/.test(rightText)) {
      endDigits = rightText;
    } else {
      const right = splitTrailingNumber(rightText);
      if (right && right.prefix.toLowerCase() === left.prefix.toLowerCase()) endDigits = right.digits;
    }
    if (endDigits === undefined) continue;
    const width = left.digits.length > 1 && left.digits.startsWith('0') ? left.digits.length : 0;
    return {
      prefix: left.prefix,
      start: Number(left.digits),
      end: Number(endDigits),
      width,
    };
  }
  return undefined;
}

/** Cisco interface names, so a pasted `Gi1/0/1-24` gets a pointed warning. */
const CISCO_NAME_RE =
  /^(gi|fa|te|tw|fo|hu|gigabitethernet|fastethernet|tengigabitethernet|twentyfivegige|fortygigabitethernet|hundredgige)\d+\//i;

/** Which numbers to keep: every one, odd or even only. */
export type Parity = 'all' | 'odd' | 'even';

export interface ExpandOptions {
  /** Keep only odd- or even-numbered interfaces, across the whole list. */
  only?: Parity;
  /** Sort by name, then number, instead of keeping the order written. */
  sort?: boolean;
}

/** A per-item modifier after a colon: `:odd`, `:even`, `:step4`. */
interface Modifier {
  parity: Parity;
  step: number;
}

const MODIFIER_RE = /:(odd|even|step\s*(\d+)|every\s*(\d+))$/i;

function readModifier(token: string): { body: string; mod: Modifier; bad?: string } {
  const mod: Modifier = { parity: 'all', step: 1 };
  const m = MODIFIER_RE.exec(token);
  if (!m) {
    // A colon with something we do not know after it.
    const colon = token.lastIndexOf(':');
    if (colon > 0) return { body: token.slice(0, colon), mod, bad: token.slice(colon) };
    return { body: token, mod };
  }
  const word = m[1].toLowerCase();
  if (word === 'odd' || word === 'even') mod.parity = word;
  else mod.step = Math.max(1, Number(m[2] ?? m[3]));
  return { body: token.slice(0, m.index), mod };
}

const matchesParity = (n: number, parity: Parity): boolean =>
  parity === 'all' || (parity === 'odd' ? n % 2 === 1 : n % 2 === 0);

/** Natural order: by the part before the number, then by the number. */
function naturalCompare(a: string, b: string): number {
  const pa = splitTrailingNumber(a);
  const pb = splitTrailingNumber(b);
  const prefixA = (pa ? pa.prefix : a).toLowerCase();
  const prefixB = (pb ? pb.prefix : b).toLowerCase();
  if (prefixA !== prefixB) return prefixA < prefixB ? -1 : 1;
  return (pa ? Number(pa.digits) : -1) - (pb ? Number(pb.digits) : -1);
}

/**
 * Expand a range list into interface names, in the order written.
 *
 * Items are separated by commas, semicolons, spaces, or new lines. Spaces
 * around a range's `-` are allowed (`port1 - port8`), and a leading Cisco
 * `interface range` is dropped. Repeats are kept once.
 *
 * An item may end in `:odd`, `:even`, or `:stepN` (every Nth from the
 * start), and an item starting with `!` is taken out of the list wherever
 * it appears: `port1-24, !port5, !port10-12`.
 */
export function expandRange(text: string, options: ExpandOptions = {}): ExpandResult {
  const warnings: Warning[] = [];
  const names: string[] = [];
  const seen = new Set<string>();
  const repeats: string[] = [];
  const excluded = new Set<string>();

  let body = text.replace(/^\s*(interface\s+range|int\s+range|interface)\s+/i, (m) => {
    warnings.push({ kind: 'fix', message: `Dropped "${m.trim()}": list only the interfaces.` });
    return '';
  });
  body = body.replace(/\s*-\s*/g, '-').replace(/\s*:\s*/g, ':').replace(/!\s+/g, '!');

  const tokens = body
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^["']|["']$/g, ''))
    .filter((t) => t !== '');

  const add = (name: string) => {
    const key = name.toLowerCase();
    if (seen.has(key)) {
      repeats.push(name);
      return;
    }
    seen.add(key);
    names.push(name);
  };

  let ciscoWarned = false;
  for (const raw of tokens) {
    const exclude = raw.startsWith('!');
    const { body: token, mod, bad } = readModifier(exclude ? raw.slice(1) : raw);
    if (!token) continue;
    if (bad) {
      warnings.push({
        message: `${raw}: "${bad}" is not a filter (use :odd, :even, or :step2), so it was ignored.`,
      });
    }
    if (!ciscoWarned && CISCO_NAME_RE.test(token)) {
      ciscoWarned = true;
      warnings.push({
        message: `"${token}" looks like a Cisco interface name. FortiOS names ports like port1, x1, or wan1.`,
      });
    }

    const found: string[] = [];
    const range = parseRange(token);
    if (!range) {
      const num = splitTrailingNumber(token);
      if (!num || matchesParity(Number(num.digits), mod.parity)) found.push(token);
    } else {
      let { start, end } = range;
      if (start > end) {
        warnings.push({ kind: 'fix', message: `${token} counts down: expanded from ${end} up to ${start}.` });
        [start, end] = [end, start];
      }
      const count = end - start + 1;
      if (count > MAX_RANGE) {
        warnings.push({
          message: `${token} would expand to ${count} interfaces (limit ${MAX_RANGE}): skipped.`,
        });
        continue;
      }
      for (let n = start; n <= end; n += mod.step) {
        if (matchesParity(n, mod.parity)) found.push(range.prefix + String(n).padStart(range.width, '0'));
      }
    }

    if (exclude) for (const name of found) excluded.add(name.toLowerCase());
    else found.forEach(add);
  }

  if (repeats.length) {
    warnings.push({
      kind: 'fix',
      message: `Listed more than once, kept once: ${[...new Set(repeats)].join(', ')}.`,
    });
  }

  let result = names.filter((n) => !excluded.has(n.toLowerCase()));
  const only = options.only ?? 'all';
  if (only !== 'all') {
    result = result.filter((n) => {
      const num = splitTrailingNumber(n);
      // A name with no number (wan, mgmt) is neither: keep it, as listed.
      return !num || matchesParity(Number(num.digits), only);
    });
  }
  if (options.sort) result = [...result].sort(naturalCompare);
  return { names: result, warnings };
}

/** First words that can open a line inside an `edit` block. */
const FORTIOS_VERBS = new Set([
  'set',
  'unset',
  'append',
  'select',
  'unselect',
  'config',
  'edit',
  'next',
  'end',
  'delete',
  'purge',
  'rename',
  'clone',
  'move',
  'get',
  'show',
]);

/** What to write instead of common Cisco interface commands, per target. */
const CISCO_HINTS: Record<RangeTarget, { re: RegExp; hint: string }[]> = {
  fortigate: [
    { re: /^description\b/i, hint: 'set description "<text>" (or set alias)' },
    { re: /^no\s+shut(down)?\b/i, hint: 'set status up' },
    { re: /^shut(down)?\b/i, hint: 'set status down' },
    {
      re: /^switchport\b/i,
      hint: 'a VLAN on a FortiGate is its own interface (set vlanid and set interface), not a port setting',
    },
  ],
  'managed-switch': [
    { re: /^description\b/i, hint: 'set description "<text>"' },
    { re: /^no\s+shut(down)?\b/i, hint: 'set status up' },
    { re: /^shut(down)?\b/i, hint: 'set status down' },
    { re: /^switchport\s+access\s+vlan\b/i, hint: 'set vlan "<FortiGate VLAN interface name>"' },
    { re: /^switchport\s+trunk\s+native\s+vlan\b/i, hint: 'set vlan "<FortiGate VLAN interface name>"' },
    {
      re: /^switchport\s+trunk\s+allowed\s+vlan\b/i,
      hint: 'set allowed-vlans "<vlan>" "<vlan>" (FortiGate VLAN interface names)',
    },
    { re: /^switchport\b/i, hint: 'set vlan and set allowed-vlans' },
    { re: /^spanning-tree\s+portfast\b/i, hint: 'set edge-port enable' },
    { re: /^power\s+inline\s+never\b/i, hint: 'set poe-status disable' },
  ],
  fortiswitch: [
    { re: /^description\b/i, hint: 'set description "<text>"' },
    {
      re: /^(no\s+)?shut(down)?\b/i,
      hint: 'port status is set under config switch physical-port, not config switch interface',
    },
    { re: /^switchport\s+access\s+vlan\b/i, hint: 'set native-vlan <vlan id>' },
    { re: /^switchport\s+trunk\s+native\s+vlan\b/i, hint: 'set native-vlan <vlan id>' },
    { re: /^switchport\s+trunk\s+allowed\s+vlan\b/i, hint: 'set allowed-vlans <vlan id>,<vlan id>' },
    { re: /^switchport\b/i, hint: 'set native-vlan and set allowed-vlans' },
  ],
};

export interface CommandResult {
  /** Command lines, indented relative to the interface's edit block. */
  lines: string[];
  warnings: Warning[];
}

/**
 * Tidy the command block: drop blanks and `#` comments, keep nested
 * `config` blocks' relative indentation, close any left open, and flag
 * lines that are not FortiOS commands.
 */
export function parseCommands(text: string, target: RangeTarget): CommandResult {
  const warnings: Warning[] = [];
  const raw = text.split(/\r?\n/).map((line, i) => ({ text: line.replace(/\s+$/, ''), line: i + 1 }));
  const kept = raw.filter((r) => r.text.trim() !== '' && !r.text.trim().startsWith('#'));

  const lines: string[] = [];
  // Open blocks, innermost last: each one indents what follows it.
  const stack: ('config' | 'edit')[] = [];
  const push = (cmd: string) => lines.push(INDENT.repeat(stack.length) + cmd);
  for (const { text: line, line: lineNo } of kept) {
    const cmd = line.trim();
    const verb = cmd.split(/\s+/)[0].toLowerCase();

    if (verb === 'end') {
      if (!stack.includes('config')) {
        warnings.push({
          line: lineNo,
          message: '"end" with no "config" before it: dropped. Each interface is closed for you.',
        });
        continue;
      }
      // An edit left without its next is closed by the end.
      while (stack.pop() !== 'config');
      push(cmd);
      continue;
    }
    if (verb === 'next') {
      if (stack[stack.length - 1] !== 'edit') {
        warnings.push({
          line: lineNo,
          message: `"${cmd}" dropped: each interface already gets its own edit and next.`,
        });
        continue;
      }
      stack.pop();
      push(cmd);
      continue;
    }
    if (verb === 'edit' && stack.length === 0) {
      warnings.push({
        line: lineNo,
        message: `"${cmd}" dropped: list interfaces in the range box, and each gets its own edit.`,
      });
      continue;
    }

    if (!FORTIOS_VERBS.has(verb)) {
      const hint = CISCO_HINTS[target].find((h) => h.re.test(cmd));
      warnings.push({
        line: lineNo,
        message: hint
          ? `"${cmd}" is Cisco syntax. In FortiOS: ${hint.hint}.`
          : `"${cmd}" is not a FortiOS command: lines here usually start with set, unset, append, or config.`,
      });
    }

    if (verb === 'edit' && stack[stack.length - 1] === 'edit') {
      // A second edit closes the first, as on the CLI.
      stack.pop();
      push('next');
    }
    push(cmd);
    if (verb === 'config') stack.push('config');
    if (verb === 'edit') stack.push('edit');
  }
  const open = stack.filter((b) => b === 'config').length;
  if (open > 0) {
    warnings.push({
      kind: 'fix',
      message: `${open} "config" block${open === 1 ? ' was' : 's were'} left open: closed with "end".`,
    });
    while (stack.length) {
      const b = stack.pop();
      push(b === 'edit' ? 'next' : 'end');
    }
  }
  return { lines, warnings };
}

/** Fill `{port}`, `{n}`, and `{i}` in one command line. */
function fillPlaceholders(line: string, name: string, index: number): string {
  const num = splitTrailingNumber(name)?.digits ?? '';
  return line
    .replace(/\{port\}/g, name)
    .replace(/\{n\}/g, num ? String(Number(num)) : '')
    .replace(/\{i\}/g, String(index + 1));
}

/**
 * How much of the surrounding config to emit.
 *
 * - `full`:  the whole path from the top, ready to paste at the prompt.
 * - `ports`: managed switches only: `config ports ... end`, for pasting
 *            while already inside `edit <switch>`.
 * - `edits`: just the `edit ... next` blocks, for pasting inside a config
 *            section you have already entered.
 */
export type WrapMode = 'full' | 'ports' | 'edits';

export interface InterfaceRangeOptions extends ExpandOptions {
  target: RangeTarget;
  /** Defaults to `full`. `ports` is the same as `full` outside managed switches. */
  wrap?: WrapMode;
  /**
   * Managed switch IDs (serial, or name after a rename on FortiOS 7.4+),
   * separated by commas, spaces, or new lines. Only used for
   * `managed-switch`; blank gives a `<switch-id>` placeholder.
   */
  switchIds?: string;
}

export interface InterfaceRangeResult {
  output: string;
  warnings: Warning[];
  names: string[];
  stats: { interfaces: number; commands: number; switches: number };
}

const quote = (s: string): string => `"${s.replace(/"/g, '')}"`;

/** Expand the range and repeat the commands inside each interface's edit block. */
export function generateInterfaceRange(
  rangeText: string,
  commandsText: string,
  options: InterfaceRangeOptions,
): InterfaceRangeResult {
  const { target } = options;
  const wrap = options.wrap ?? 'full';
  const expanded = expandRange(rangeText, options);
  const commands = parseCommands(commandsText, target);
  const warnings = [...expanded.warnings, ...commands.warnings];
  const names = expanded.names;

  if (
    names.some((n) => !splitTrailingNumber(n)) &&
    commands.lines.some((l) => l.includes('{n}'))
  ) {
    warnings.push({ message: '{n} is blank for interfaces whose name does not end in a number.' });
  }

  const switchIds =
    target === 'managed-switch'
      ? (options.switchIds ?? '').split(/[\s,;]+/).filter((s) => s !== '')
      : [];
  if (target === 'managed-switch' && wrap === 'full' && switchIds.length === 0 && names.length && commands.lines.length) {
    warnings.push({
      message:
        'No switch ID given: replace <switch-id> with the switch serial, or its name if it was renamed on FortiOS 7.4 or later.',
    });
  }

  const stats = {
    interfaces: names.length,
    commands: commands.lines.length,
    switches: target === 'managed-switch' && wrap === 'full' ? Math.max(switchIds.length, 1) : 0,
  };
  if (!names.length || !commands.lines.length) {
    return { output: '', warnings, names, stats };
  }

  /** The edit blocks for every interface, at a given base depth. */
  const edits = (depth: number): string[] => {
    const out: string[] = [];
    names.forEach((name, i) => {
      out.push(`${INDENT.repeat(depth)}edit ${quote(name)}`);
      for (const line of commands.lines) {
        out.push(INDENT.repeat(depth + 1) + fillPlaceholders(line, name, i));
      }
      out.push(`${INDENT.repeat(depth)}next`);
    });
    return out;
  };

  if (wrap === 'edits') {
    return { output: edits(0).join('\n'), warnings, names, stats };
  }
  if (wrap === 'ports' && target === 'managed-switch') {
    const out = ['config ports', ...edits(1), 'end'];
    return { output: out.join('\n'), warnings, names, stats };
  }

  const out: string[] = [];
  if (target === 'managed-switch') {
    out.push('config switch-controller managed-switch');
    for (const id of switchIds.length ? switchIds : ['<switch-id>']) {
      out.push(`${INDENT}edit ${id === '<switch-id>' ? id : quote(id)}`);
      out.push(`${INDENT.repeat(2)}config ports`);
      out.push(...edits(3));
      out.push(`${INDENT.repeat(2)}end`);
      out.push(`${INDENT}next`);
    }
    out.push('end');
  } else {
    out.push(target === 'fortigate' ? 'config system interface' : 'config switch interface');
    out.push(...edits(1));
    out.push('end');
  }

  return { output: out.join('\n'), warnings, names, stats };
}
