import type { Warning } from '../../types';
import type { ObjectHelperOptions } from './types';
import { MAX_OBJ_NAME_LEN } from './types';

/** Sink for non-fatal messages (the Python script's stderr prints). */
export type WarnSink = (message: string, line?: number) => void;

/** Collects warnings into an array, matching the Warning interface. */
export function makeWarningCollector(): { warnings: Warning[]; warn: WarnSink } {
  const warnings: Warning[] = [];
  return {
    warnings,
    warn(message, line) {
      warnings.push(line !== undefined ? { line, message } : { message });
    },
  };
}

/** Python-style repr() for strings, used to mirror warning text exactly. */
export function pyRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let body = '';
  for (const ch of s) {
    if (ch === '\\') body += '\\\\';
    else if (ch === quote) body += '\\' + ch;
    else if (ch === '\n') body += '\\n';
    else if (ch === '\r') body += '\\r';
    else if (ch === '\t') body += '\\t';
    else {
      const code = ch.codePointAt(0) ?? 0;
      if (code < 0x20 || code === 0x7f) body += '\\x' + code.toString(16).padStart(2, '0');
      else body += ch;
    }
  }
  return quote + body + quote;
}

/**
 * Python-str.format-alike supporting {key} substitution and {{ }} escapes.
 * Unknown keys throw (mirroring Python's KeyError, whose str() is "'key'").
 */
export function pyFormat(template: string, vars: Record<string, string>): string {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === '{') {
      if (template[i + 1] === '{') {
        out += '{';
        i += 2;
        continue;
      }
      const end = template.indexOf('}', i);
      if (end === -1) throw new Error("Single '{' encountered in format string");
      const key = template.slice(i + 1, end);
      if (!(key in vars)) throw new Error(`'${key}'`);
      out += vars[key];
      i = end + 1;
    } else if (ch === '}') {
      if (template[i + 1] === '}') {
        out += '}';
        i += 2;
        continue;
      }
      throw new Error("Single '}' encountered in format string");
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Strip the given characters from both ends (like Python's str.strip(chars)). */
export function stripChars(s: string, chars: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && chars.includes(s[start])) start++;
  while (end > start && chars.includes(s[end - 1])) end--;
  return s.slice(start, end);
}

/** Drop everything from the first '#' or ';' on, then trim. */
export function stripInlineComment(s: string): string {
  return s.split(/[#;]/)[0].trim();
}

/** Split input text into meaningful (non-blank, comment-stripped) lines. */
export function loadMeaningfulLines(input: string): string[] {
  const lines: string[] = [];
  for (const raw of input.split(/\r\n|\r|\n/)) {
    const cleaned = stripInlineComment(raw);
    if (cleaned) lines.push(cleaned);
  }
  return lines;
}

/** One input record: (lineno, name-or-null, value, input-comment-or-null). */
export interface InputRecord {
  lineno: number;
  name: string | null;
  value: string;
  comment: string | null;
}

/**
 * Turn meaningful lines into records according to the input-format options.
 * Mirrors iter_records() including its warning texts; line numbers refer to
 * positions within the meaningful-line list, exactly like the Python script.
 */
export function iterRecords(
  lines: string[],
  opts: ObjectHelperOptions,
  warn: WarnSink,
): InputRecord[] {
  const records: InputRecord[] = [];

  if (opts.nameFqdnDelimiter) {
    const delim = opts.nameFqdnDelimiter;
    lines.forEach((line, idx) => {
      const lineno = idx + 1;
      const sep = line.indexOf(delim);
      if (sep === -1) {
        warn(`No delimiter ${pyRepr(delim)} found; skipping: '${line}'`, lineno);
        return;
      }
      const namePart = line.slice(0, sep);
      const valuePart = line.slice(sep + delim.length);
      records.push({
        lineno,
        name: stripChars(namePart.trim(), '"'),
        value: valuePart.trim(),
        comment: null,
      });
    });
  } else if (opts.useExplicitNames) {
    if (opts.useInputComment) {
      if (lines.length % 3 !== 0) {
        warn(
          `Warning: input has ${lines.length} non-empty lines, which is not a multiple ` +
            `of 3 (name / fqdn / comment). Trailing incomplete group will be ignored.`,
        );
      }
      for (let i = 0; i <= lines.length - 3; i += 3) {
        records.push({
          lineno: i + 1,
          name: stripChars(lines[i].trim(), '"'),
          value: lines[i + 1].trim(),
          comment: lines[i + 2].trim() || null,
        });
      }
    } else {
      if (lines.length % 2 !== 0) {
        warn(
          `Warning: input has an odd number of non-empty lines (${lines.length}). ` +
            `The last line will be ignored: '${lines[lines.length - 1]}'`,
        );
      }
      for (let i = 0; i <= lines.length - 2; i += 2) {
        records.push({
          lineno: i + 1,
          name: stripChars(lines[i].trim(), '"'),
          value: lines[i + 1].trim(),
          comment: null,
        });
      }
    }
  } else if (opts.useInputComment) {
    if (lines.length % 2 !== 0) {
      warn(
        `Warning: input has an odd number of non-empty lines (${lines.length}). ` +
          `Trailing line will be ignored: '${lines[lines.length - 1]}'`,
      );
    }
    for (let i = 0; i <= lines.length - 2; i += 2) {
      records.push({
        lineno: i + 1,
        name: null,
        value: lines[i].trim(),
        comment: lines[i + 1].trim() || null,
      });
    }
  } else {
    lines.forEach((line, idx) => {
      records.push({ lineno: idx + 1, name: null, value: line, comment: null });
    });
  }

  return records;
}

const LABEL_RE = /^[A-Za-z0-9-]+$/;

/**
 * Validate (and normalize) an FQDN, mirroring validate_fqdn().
 * Throws Error with the exact Python error messages on invalid input.
 */
export function validateFqdn(fqdn: string, opts: { lowercaseFqdn: boolean }): string {
  let f = stripChars(stripChars(fqdn.trim(), '"'), "'");
  if (opts.lowercaseFqdn) f = f.toLowerCase();

  if (!f) throw new Error('empty fqdn');
  if (/\s/.test(f)) throw new Error('fqdn contains whitespace');

  const candidate = f.startsWith('*.') ? f.slice(2) : f;

  if (candidate.includes('://') || candidate.includes('/')) {
    throw new Error('fqdn looks like a URL; provide host only (e.g., example.com)');
  }

  const labels = candidate.split('.');
  if (labels.length < 2) {
    throw new Error('fqdn must contain a dot (e.g., example.com)');
  }

  for (const lab of labels) {
    if (!lab) throw new Error('fqdn has an empty label (..)');
    if (lab.length > 63) throw new Error('fqdn label too long (>63)');
    if (lab.startsWith('-') || lab.endsWith('-')) {
      throw new Error("fqdn label cannot start/end with '-'");
    }
    if (!LABEL_RE.test(lab)) {
      throw new Error(`fqdn label has invalid chars: ${pyRepr(lab)}`);
    }
  }

  return f;
}

/**
 * Sanitize an object name, mirroring safe_obj_name(): strip double quotes,
 * newlines to spaces, collapse whitespace. Warns (does not fail) when the
 * result exceeds the FortiGate name length limit.
 */
export function safeObjName(name: string, warn: WarnSink): string {
  let n = name.replace(/"/g, '').replace(/\n/g, ' ').trim();
  n = n.replace(/\s+/g, ' ');
  if (!n) throw new Error('empty object name');
  if (n.length > MAX_OBJ_NAME_LEN) {
    warn(
      `Warning: object name exceeds ${MAX_OBJ_NAME_LEN} chars and will be ` +
        `rejected by FortiGate: '${n}'`,
    );
  }
  return n;
}
