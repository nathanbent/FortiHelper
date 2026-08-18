#!/usr/bin/env python3
"""
fortiedit.py  -  bulk query and edit tool for FortiOS "show" / config output.

Reads FortiOS configuration text (a full backup, or the output of a `show`
command pasted straight from the CLI), matches entries by field conditions,
mutates them (append / remove / replace values), and emits either the full
rebuilt section or a minimal delta you can paste back into the box.

It is quote-aware and it reconstructs long values that the FortiOS pager
wrapped mid-token across several lines, so pasted `show` output parses cleanly.

The important behaviour for your case: append is real append, not set. It
reads the existing value list, adds the new token only if it is not already
present, and re-emits the whole field (because FortiOS `set` on a multi-value
field is a full replacement, that is how you realise append semantics safely).
Policies whose interface is "any" or some other value are left untouched,
because matching is on the literal token, not a substring of the line.

Examples
--------
Preview every policy whose srcintf contains x1:
    ./fortiedit.py config.txt -w srcintf:contains:x1 --dry-run

Append x2 to srcintf on every policy that already has x1 (delta to stdout):
    ./fortiedit.py config.txt -w srcintf:contains:x1 -a srcintf:x2

Both interface directions in one pass, via a rules file:
    ./fortiedit.py config.txt --rules add-x2.json

Rebuild the whole section instead of a delta:
    ./fortiedit.py config.txt -w srcintf:contains:x1 -a srcintf:x2 -o full

Match conditions (repeatable, AND-ed):   FIELD:OP:VALUE
    op = contains | not-contains | equals | exists | absent
Mutations (repeatable):
    -a / --append   FIELD:VALUE
    -d / --remove   FIELD:VALUE
    --set           FIELD:VALUE[,VALUE...]

Human-readable change summary always goes to stderr; stdout is pure,
pasteable config.
"""

import argparse
import json
import sys

KEYWORDS = {"config", "edit", "set", "unset", "next", "end"}
INDENT = "    "


# --------------------------------------------------------------------------- #
# Data model
# --------------------------------------------------------------------------- #
class Setting:
    def __init__(self, name, values):
        self.name = name
        self.values = list(values)          # raw tokens, quoting preserved

    def clone(self):
        return Setting(self.name, self.values)


class Unset:
    def __init__(self, name):
        self.name = name


class Entry:
    """An `edit <key> ... next` block."""
    def __init__(self, key):
        self.key = key                      # raw token, e.g. '30' or '"name"'
        self.children = []                  # Setting / Unset / ConfigBlock
        self.changed_fields = []            # names of settings this run modified

    def settings(self):
        return {c.name: c for c in self.children if isinstance(c, Setting)}

    def get(self, name):
        return self.settings().get(name)


class ConfigBlock:
    """A `config <path> ... end` block."""
    def __init__(self, path):
        self.path = path                    # e.g. 'firewall policy'
        self.children = []                  # Entry (table) or Setting (object)

    def entries(self):
        return [c for c in self.children if isinstance(c, Entry)]


class Root:
    def __init__(self):
        self.blocks = []                    # top-level ConfigBlocks, in order

    def find(self, path):
        for b in self.blocks:
            if isinstance(b, ConfigBlock) and b.path == path:
                return b
        return None


# --------------------------------------------------------------------------- #
# Tokenizer  (quote-aware, quotes preserved on the token)
# --------------------------------------------------------------------------- #
def tokenize(line):
    toks, i, n = [], 0, len(line)
    while i < n:
        while i < n and line[i] in " \t":
            i += 1
        if i >= n:
            break
        if line[i] == '"':
            j = i + 1
            while j < n and line[j] != '"':
                j += 1
            toks.append(line[i:j + 1])       # include both quotes
            i = j + 1
        else:
            j = i
            while j < n and line[j] not in " \t":
                j += 1
            toks.append(line[i:j])
            i = j
    return toks


def unq(tok):
    if len(tok) >= 2 and tok[0] == '"' and tok[-1] == '"':
        return tok[1:-1]
    return tok


def q(val):
    """Quote a bare value FortiOS-style, unless already quoted."""
    if len(val) >= 2 and val[0] == '"' and val[-1] == '"':
        return val
    return '"%s"' % val


# --------------------------------------------------------------------------- #
# Parser
# --------------------------------------------------------------------------- #
def parse(text):
    root = Root()
    stack = [root]                          # top is current container
    logical = None                          # pending logical line (string)

    def inside_config():
        return any(isinstance(x, ConfigBlock) for x in stack)

    def flush(line):
        toks = tokenize(line)
        if not toks:
            return
        kw = toks[0]
        top = stack[-1]

        if kw == "config":
            path = " ".join(unq(t) for t in toks[1:])
            block = ConfigBlock(path)
            (top.blocks if isinstance(top, Root) else top.children).append(block)
            stack.append(block)
        elif kw == "edit":
            entry = Entry(toks[1] if len(toks) > 1 else '""')
            top.children.append(entry)
            stack.append(entry)
        elif kw == "next":
            if isinstance(stack[-1], Entry):
                stack.pop()
        elif kw == "end":
            if isinstance(stack[-1], ConfigBlock):
                stack.pop()
        elif kw == "set":
            if len(toks) >= 2 and hasattr(top, "children"):
                top.children.append(Setting(toks[1], toks[2:]))
        elif kw == "unset":
            if len(toks) >= 2 and hasattr(top, "children"):
                top.children.append(Unset(toks[1]))
        # anything else at this point is ignored

    for raw in text.splitlines():
        line = raw.rstrip("\r")
        stripped = line.strip()
        if stripped == "":
            continue
        first = stripped.split(None, 1)[0]
        if first in KEYWORDS:
            if logical is not None:
                flush(logical)
            logical = stripped
        else:
            # Not a keyword line. It is a continuation of a wrapped value only
            # if we are mid-config and the pending line is a set/unset. Prompt
            # banners and stray lines at the root are dropped.
            if logical is not None and inside_config() and \
               (logical.startswith("set ") or logical.startswith("unset ")):
                logical += line          # raw concat: rebuild mid-token wraps
            # else: noise, ignore
    if logical is not None:
        flush(logical)
    return root


# --------------------------------------------------------------------------- #
# Matching
# --------------------------------------------------------------------------- #
def matches(entry, conditions):
    for field, op, value in conditions:
        s = entry.get(field)
        present = [unq(v) for v in s.values] if s else []
        v = unq(value)
        if op == "contains":
            if v not in present:
                return False
        elif op == "not-contains":
            if v in present:
                return False
        elif op == "equals":
            if present != [v]:
                return False
        elif op == "exists":
            if s is None:
                return False
        elif op == "absent":
            if s is not None:
                return False
        else:
            raise ValueError("unknown match op: %s" % op)
    return True


# --------------------------------------------------------------------------- #
# Mutations  (return True if the entry changed)
# --------------------------------------------------------------------------- #
def do_append(entry, field, value):
    s = entry.get(field)
    v = unq(value)
    if s is None:
        entry.children.append(Setting(field, [q(value)]))
        entry.changed_fields.append(field)
        return True
    if v in [unq(x) for x in s.values]:
        return False                        # idempotent
    s.values.append(q(value))
    entry.changed_fields.append(field)
    return True


def do_remove(entry, field, value):
    s = entry.get(field)
    if s is None:
        return False
    v = unq(value)
    keep = [x for x in s.values if unq(x) != v]
    if len(keep) == len(s.values):
        return False
    s.values = keep
    entry.changed_fields.append(field)
    return True


def do_set(entry, field, values):
    new = [q(x) for x in values]
    s = entry.get(field)
    if s is not None and s.values == new:
        return False
    if s is None:
        entry.children.append(Setting(field, new))
    else:
        s.values = new
    entry.changed_fields.append(field)
    return True


# --------------------------------------------------------------------------- #
# Emit
# --------------------------------------------------------------------------- #
def emit_setting(s, depth):
    tail = (" " + " ".join(s.values)) if s.values else ""
    return "%sset %s%s" % (INDENT * depth, s.name, tail)


def emit_full_block(block):
    out = ["config %s" % block.path]
    for child in block.children:
        if isinstance(child, Entry):
            out.append("%sedit %s" % (INDENT, child.key))
            out.extend(_emit_children(child.children, 2))
            out.append("%snext" % INDENT)
        elif isinstance(child, Setting):
            out.append(emit_setting(child, 1))
        elif isinstance(child, Unset):
            out.append("%sunset %s" % (INDENT, child.name))
    out.append("end")
    return "\n".join(out)


def _emit_children(children, depth):
    lines = []
    for c in children:
        if isinstance(c, Setting):
            lines.append(emit_setting(c, depth))
        elif isinstance(c, Unset):
            lines.append("%sunset %s" % (INDENT * depth, c.name))
        elif isinstance(c, ConfigBlock):
            lines.append("%sconfig %s" % (INDENT * depth, c.path))
            for e in c.children:
                if isinstance(e, Entry):
                    lines.append("%sedit %s" % (INDENT * (depth + 1), e.key))
                    lines.extend(_emit_children(e.children, depth + 2))
                    lines.append("%snext" % (INDENT * (depth + 1)))
                else:
                    lines.extend(_emit_children([e], depth + 1))
            lines.append("%send" % (INDENT * depth))
    return lines


def emit_delta(block, changed_entries):
    """Only the touched entries, only their changed fields."""
    out = ["config %s" % block.path]
    for e in changed_entries:
        out.append("%sedit %s" % (INDENT, e.key))
        seen = []
        for f in e.changed_fields:
            if f in seen:
                continue
            seen.append(f)
            s = e.get(f)
            if s is None:                   # field was removed entirely
                out.append("%sunset %s" % (INDENT * 2, f))
            else:
                out.append(emit_setting(s, 2))
        out.append("%snext" % INDENT)
    out.append("end")
    return "\n".join(out)


# --------------------------------------------------------------------------- #
# Rule application
# --------------------------------------------------------------------------- #
def apply_rules(block, rules):
    """rules: list of dicts {where:[[f,op,v]...], append/remove/set:[...]}"""
    changed = []
    for entry in block.entries():
        entry.changed_fields = []
    for rule in rules:
        conds = rule.get("where", [])
        for entry in block.entries():
            if not matches(entry, conds):
                continue
            hit = False
            for f, v in rule.get("append", []):
                hit |= do_append(entry, f, v)
            for f, v in rule.get("remove", []):
                hit |= do_remove(entry, f, v)
            for f, vals in rule.get("set", []):
                hit |= do_set(entry, f, vals)
            if hit and entry not in changed:
                changed.append(entry)
    return changed


def entry_label(entry):
    name = entry.get("name")
    if name and name.values:
        return "%s  %s" % (entry.key, unq(name.values[0]))
    return entry.key


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def parse_cli_rules(args):
    if args.rules:
        with open(args.rules) as fh:
            data = json.load(fh)
        section = data.get("section", args.section)
        rules = data["rules"]
        return section, rules

    where = []
    for w in args.where or []:
        parts = w.split(":", 2)
        if len(parts) != 3:
            sys.exit("bad -w '%s', expected FIELD:OP:VALUE" % w)
        where.append(parts)

    rule = {"where": where}
    if args.append:
        rule["append"] = [a.split(":", 1) for a in args.append]
    if args.remove:
        rule["remove"] = [d.split(":", 1) for d in args.remove]
    if args.set:
        setops = []
        for s in args.set:
            f, vals = s.split(":", 1)
            setops.append([f, vals.split(",")])
        rule["set"] = setops
    return args.section, [rule]


def main():
    ap = argparse.ArgumentParser(
        description="Bulk query and edit FortiOS config / show output.")
    ap.add_argument("input", help="config file, or - for stdin")
    ap.add_argument("-s", "--section", default="firewall policy",
                    help='config section to work on (default "firewall policy")')
    ap.add_argument("-w", "--where", action="append",
                    help="match condition FIELD:OP:VALUE (repeatable, AND)")
    ap.add_argument("-a", "--append", action="append",
                    help="append value FIELD:VALUE (repeatable)")
    ap.add_argument("-d", "--remove", action="append",
                    help="remove value FIELD:VALUE (repeatable)")
    ap.add_argument("--set", action="append",
                    help="replace value FIELD:VALUE[,VALUE...] (repeatable)")
    ap.add_argument("--rules", help="JSON rules file for multi-rule batches")
    ap.add_argument("-o", "--output", choices=["delta", "full"], default="delta",
                    help="delta = only changed edits (default); full = whole section")
    ap.add_argument("--dry-run", action="store_true",
                    help="report matches to stderr, emit no config")
    args = ap.parse_args()

    text = sys.stdin.read() if args.input == "-" else open(args.input).read()
    root = parse(text)

    section, rules = parse_cli_rules(args)
    block = root.find(section)
    if block is None:
        sys.exit("section '%s' not found in input" % section)

    if args.dry_run:
        for rule in rules:
            conds = rule.get("where", [])
            hits = [e for e in block.entries() if matches(e, conds)]
            desc = " AND ".join(":".join(c) for c in conds) or "(all)"
            sys.stderr.write("Match %s  ->  %d entr%s:\n"
                             % (desc, len(hits), "y" if len(hits) == 1 else "ies"))
            for e in hits:
                sys.stderr.write("  edit %s\n" % entry_label(e))
        return

    changed = apply_rules(block, rules)

    sys.stderr.write("Changed %d entr%s in '%s':\n"
                     % (len(changed), "y" if len(changed) == 1 else "ies", section))
    for e in changed:
        fields = ", ".join(dict.fromkeys(e.changed_fields))
        sys.stderr.write("  edit %-28s  [%s]\n" % (entry_label(e), fields))

    if not changed:
        sys.stderr.write("Nothing to do; no config emitted.\n")
        return

    if args.output == "full":
        print(emit_full_block(block))
    else:
        print(emit_delta(block, changed))


if __name__ == "__main__":
    main()
