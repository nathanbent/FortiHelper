import type { Warning } from '../../types';

/** `set type` values for a static URL filter entry. */
export type UrlFilterType = 'simple' | 'regex' | 'wildcard';

/** `set action` values for a static URL filter entry. */
export type UrlFilterAction = 'block' | 'exempt' | 'allow' | 'monitor';

/**
 * Shape of the generated config.
 *
 * - `bare`     — the original script's `edit "<domain>" / set status / next`
 *                blocks, keyed by domain. Kept as the default for parity.
 * - `entries`  — numbered entries (`edit 1 / set url "<domain>" / …`) to paste
 *                inside an existing `config entries` block.
 * - `full`     — a complete `config webfilter urlfilter` list wrapping the
 *                numbered entries.
 */
export type WebfilterFormat = 'bare' | 'entries' | 'full';

/** Optional `*` / `*.` prefix applied to each domain for wildcard entries. */
export type WildcardPrefix = 'none' | '*' | '*.';

/** Delimiter between a URL and its per-entry action suffix. */
export type ActionDelimiter = '-' | ',' | ':' | ';' | 'whitespace';

/** FortiOS action names, always accepted as per-entry suffixes. */
const NATIVE_ACTIONS: Record<string, UrlFilterAction> = {
  block: 'block',
  exempt: 'exempt',
  allow: 'allow',
  monitor: 'monitor',
};

/**
 * Other vendors' action verbs → the closest FortiOS action, for lists exported
 * from Sophos, WatchGuard, SonicWall, Lightspeed, and the like. `warn` has no
 * FortiOS equivalent in a static URL filter — `monitor` (allow + log) is the
 * nearest behavior, and using it surfaces a warning so the mapping is visible.
 */
export const VENDOR_VERBS: Record<string, UrlFilterAction> = {
  deny: 'block',
  denied: 'block',
  drop: 'block',
  reject: 'block',
  rejected: 'block',
  blocked: 'block',
  prohibit: 'block',
  prohibited: 'block',
  forbidden: 'block',
  blacklist: 'block',
  blacklisted: 'block',
  permit: 'allow',
  permitted: 'allow',
  pass: 'allow',
  accept: 'allow',
  accepted: 'allow',
  allowed: 'allow',
  trust: 'allow',
  trusted: 'allow',
  whitelist: 'allow',
  whitelisted: 'allow',
  warn: 'monitor',
  warning: 'monitor',
  log: 'monitor',
  audit: 'monitor',
  bypass: 'exempt',
  skip: 'exempt',
  exclude: 'exempt',
  excluded: 'exempt',
  exempted: 'exempt',
};

/**
 * Scanning and filtering operations an exempt entry can skip, in the order the
 * admin guide lists them. Only meaningful when the action is `exempt`.
 */
export const EXEMPT_FLAGS = [
  'av',
  'web-content',
  'activex-java-cookie',
  'dlp',
  'fortiguard',
  'range-block',
  'pass',
  'antiphish',
  'all',
] as const;

export type ExemptFlag = (typeof EXEMPT_FLAGS)[number];

/** Human-readable descriptions from the admin guide, for the UI. */
export const EXEMPT_FLAG_LABELS: Record<ExemptFlag, string> = {
  av: 'Antivirus scanning',
  'web-content': 'Web filter content matching',
  'activex-java-cookie': 'ActiveX, Java, and cookie filtering',
  dlp: 'DLP scanning',
  fortiguard: 'FortiGuard web filtering',
  'range-block': 'Range block feature',
  pass: 'Pass single connection from all',
  antiphish: 'Antiphish credential checking',
  all: 'Exempt from all of the above',
};

/** Options mirroring the webfilter-generator.py CLI flags, plus URL-filter fields. */
export interface WebfilterOptions {
  /** `set status …` value for each entry, or 'omit' for no status line. Default 'enable'. */
  status?: 'enable' | 'disable' | 'omit';
  /**
   * `set action …`. In `bare` format 'block' emits no action line (matching the
   * original script); the `entries` and `full` formats always emit it.
   */
  action?: UrlFilterAction;
  /** Case-insensitive dedupe, keeping first occurrence. Default true. */
  dedupe?: boolean;
  /** Case-insensitive sort. Default true. */
  sort?: boolean;

  /**
   * Parse a per-entry action suffix (`contoso.com-block`), for lists that
   * carry their own verdicts. Lines without a recognized suffix use `action`.
   * Default false.
   */
  perEntryActions?: boolean;
  /** Delimiter before the action suffix. Default '-'. */
  actionDelimiter?: ActionDelimiter;
  /**
   * With `perEntryActions`, also accept other vendors' verbs as suffixes
   * (deny → block, permit → allow, warn → monitor, bypass → exempt, …).
   * Default false.
   */
  vendorVerbs?: boolean;
  /**
   * Strip `scheme://`, credentials, paths, ports, and trailing dots from each
   * entry, so full URLs from a vendor export become bare domains. Not applied
   * when `type` is regex. Default false.
   */
  cleanUrls?: boolean;
  /** With `cleanUrls`, also strip a leading `www.`. Default false. */
  stripWww?: boolean;

  /** Output shape. Default 'bare'. */
  format?: WebfilterFormat;
  /**
   * `set type …`. Omitted when undefined. 'auto' picks per entry: a URL
   * containing `*` is a wildcard, anything else is simple.
   */
  type?: UrlFilterType | 'auto';
  /**
   * Prefix added to each domain when `type` is 'wildcard', e.g. 'facebook.com'
   * → '*facebook.com'. Domains that already start with `*` are left alone.
   * Default 'none'.
   */
  wildcardPrefix?: WildcardPrefix;
  /**
   * `set exempt …` — operations exempt URLs skip. Only emitted when `action`
   * is 'exempt'. `all` subsumes the rest, so it is emitted on its own.
   */
  exempt?: ExemptFlag[];

  /** First entry id for the `entries` / `full` formats. Default 1. */
  startId?: number;
  /** `edit <id>` of the URL filter list, `full` format only. Default 1. */
  listId?: number;
  /** `set name …` of the URL filter list, `full` format only. Default 'webfilter'. */
  listName?: string;
  /** `set comment …` of the URL filter list, `full` format only. Omitted when empty. */
  comment?: string;
  /**
   * `set include-subdomains …` on the list, `full` format only. Omitted when
   * undefined. Per the admin guide this applies to `simple` entries only,
   * where it defaults to enable (slack.com also matches hooks.slack.com).
   */
  includeSubdomains?: boolean;
  /**
   * Append a `config webfilter profile` block binding the list via
   * `set urlfilter-table <listId>`, so the generated config takes effect.
   * `full` format only. Default false.
   */
  bindProfile?: boolean;
  /** Web filter profile edited by the binding block. Default 'webfilter'. */
  profileName?: string;
}

export interface WebfilterResult {
  output: string;
  warnings: Warning[];
  stats: {
    /** Number of entries emitted. */
    domains: number;
    /** Number of entries skipped by dedupe. */
    duplicatesRemoved: number;
    /** How many emitted entries resolved to `wildcard` type. */
    wildcardEntries: number;
    /** Resolved action counts, only populated when `perEntryActions` is on. */
    actions?: Partial<Record<UrlFilterAction, number>>;
  };
}

/**
 * The `type` for one entry. Under 'auto', `*` is what makes a URL a wildcard —
 * it has no special meaning in a simple entry, so its presence is the signal.
 */
export function resolveType(
  url: string,
  type: UrlFilterType | 'auto' | undefined,
): UrlFilterType | undefined {
  if (type !== 'auto') return type;
  return url.includes('*') ? 'wildcard' : 'simple';
}

/**
 * Same pattern as the Python DOMAIN_RE. In the original script a failed match
 * is a no-op (non-standard names are kept); here it only drives a warning.
 */
const DOMAIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z]{2,})+$/;

/**
 * Split like Python's str.splitlines(): \r\n, \n, \r, and the less common
 * line boundaries (\v, \f, FS, GS, RS, NEL, LS, PS). No trailing empty line
 * for text ending in a line break.
 */
function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Escape embedded double quotes, as the original script does. */
function q(value: string): string {
  return value.replace(/"/g, '\\"');
}

/**
 * Split off a would-be action suffix at the *last* delimiter, so domains that
 * contain the delimiter themselves survive: `my-site.com` splits into
 * `my` + `site.com`, which is not a verb, and the line is kept whole.
 */
function splitActionSuffix(
  s: string,
  delimiter: ActionDelimiter,
): { rest: string; suffix: string } | undefined {
  const idx =
    delimiter === 'whitespace'
      ? Math.max(s.lastIndexOf(' '), s.lastIndexOf('\t'))
      : s.lastIndexOf(delimiter);
  if (idx <= 0 || idx >= s.length - 1) return undefined;
  const rest = s.slice(0, idx).trim();
  const suffix = s.slice(idx + 1).trim();
  if (!rest || !suffix) return undefined;
  return { rest, suffix };
}

/** Reduce a pasted URL to its host: scheme, credentials, path, port, trailing dot. */
function cleanUrl(s: string, stripWww: boolean): string {
  let u = s.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//, '');
  const cut = u.search(/[/?#]/);
  if (cut !== -1) u = u.slice(0, cut);
  const at = u.lastIndexOf('@');
  if (at !== -1) u = u.slice(at + 1);
  u = u.replace(/:\d+$/, '');
  u = u.replace(/\.+$/, '');
  // Only strip www. when a domain is left behind (never turn www.com into com).
  if (stripWww && /^www\./i.test(u) && u.slice(4).includes('.')) u = u.slice(4);
  return u;
}

/** One parsed input line: the URL plus its per-entry action, if it had one. */
interface Entry {
  url: string;
  /** Overrides the list-level action when set. */
  action?: UrlFilterAction;
}

/**
 * Port of webfilter-generator.py: normalize a domain list and emit FortiOS
 * urlfilter entries.
 *
 * With default options the output is byte-identical to the Python script.
 */
export function generateWebfilter(input: string, options: WebfilterOptions = {}): WebfilterResult {
  const status = options.status ?? 'enable';
  const action = options.action ?? 'block';
  const dedupe = options.dedupe ?? true;
  const sort = options.sort ?? true;
  const format = options.format ?? 'bare';
  const type = options.type;
  const wildcardPrefix = options.wildcardPrefix ?? 'none';
  const startId = options.startId ?? 1;
  const listId = options.listId ?? 1;
  const listName = options.listName ?? 'webfilter';
  const comment = options.comment ?? '';
  const exempt = options.exempt ?? [];
  const includeSubdomains = options.includeSubdomains;
  const bindProfile = options.bindProfile ?? false;
  const profileName = options.profileName ?? 'webfilter';
  const perEntryActions = options.perEntryActions ?? false;
  const actionDelimiter = options.actionDelimiter ?? '-';
  const vendorVerbs = options.vendorVerbs ?? false;
  const cleanUrls = (options.cleanUrls ?? false) && type !== 'regex';
  const stripWww = options.stripWww ?? false;

  const warnings: Warning[] = [];
  // Resolved action per lowercased URL, for dedupe and conflict warnings.
  const seen = new Map<string, UrlFilterAction>();
  const out: Entry[] = [];
  let duplicatesRemoved = 0;
  let warnedWarnMapping = false;

  if ((options.cleanUrls ?? false) && type === 'regex') {
    warnings.push({ message: 'URL cleanup is not applied when the type is regex' });
  }

  // `*facebook.com` and regex patterns are not domain names, so the domain
  // shape warning would be pure noise for those. Under 'auto' it is decided
  // per entry, since only some of them are wildcards.
  const shouldWarn = (s: string) => {
    if (type === 'wildcard' || type === 'regex') return false;
    if (type === 'auto') return !s.includes('*');
    return true;
  };

  const lines = splitLines(input);
  for (let i = 0; i < lines.length; i++) {
    let s = lines[i].trim();
    if (!s || s.startsWith('#')) continue;
    // Strip one pair of matching surrounding quotes (single or double).
    // Note: like the Python, a lone quote character also matches (startswith
    // and endswith both see the same character) and becomes an empty entry.
    if (
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))
    ) {
      s = s.slice(1, -1).trim();
    }
    // A per-entry suffix only takes effect when it resolves to an action, so
    // a hyphenated domain (my-site.com) is never split apart by accident.
    let entryAction: UrlFilterAction | undefined;
    if (perEntryActions) {
      const split = splitActionSuffix(s, actionDelimiter);
      if (split) {
        const verb = split.suffix.toLowerCase();
        const mapped = NATIVE_ACTIONS[verb] ?? (vendorVerbs ? VENDOR_VERBS[verb] : undefined);
        if (mapped) {
          entryAction = mapped;
          s = split.rest;
          if (!warnedWarnMapping && (verb === 'warn' || verb === 'warning')) {
            warnedWarnMapping = true;
            warnings.push({
              message:
                'warn has no FortiOS equivalent in a static URL filter — mapped to monitor (allow + log)',
            });
          }
        } else if (actionDelimiter !== '-') {
          // With a dash the delimiter appears inside ordinary domains, so an
          // unmatched suffix is normal; with any other delimiter it is almost
          // certainly a typo'd verb worth flagging.
          warnings.push({
            line: i + 1,
            message: `"${split.suffix}" is not a recognized action — line kept as-is`,
          });
        }
      }
    }
    if (cleanUrls) s = cleanUrl(s, stripWww);
    // The Python DOMAIN_RE check is a deliberate no-op (non-standard names
    // are kept); we surface a warning but never reject the entry.
    if (shouldWarn(s) && !DOMAIN_RE.test(s)) {
      warnings.push({
        line: i + 1,
        message: `"${s}" does not look like a domain name (kept anyway)`,
      });
    }
    const key = s.toLowerCase();
    const resolved = entryAction ?? action;
    if (dedupe && seen.has(key)) {
      duplicatesRemoved++;
      const kept = seen.get(key)!;
      if (kept !== resolved) {
        warnings.push({
          line: i + 1,
          message: `"${s}" repeats with a different action — kept ${kept}, ignored ${resolved}`,
        });
      }
      continue;
    }
    seen.set(key, resolved);
    out.push({ url: s, action: entryAction });
  }

  if (sort) {
    // Stable sort on the lowercased value, matching list.sort(key=str.lower).
    out.sort((a, b) => {
      const ka = a.url.toLowerCase();
      const kb = b.url.toLowerCase();
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }

  // Domains that already carry a `*` anywhere are wildcards as typed, so
  // prefixing them would change what they match.
  const entries =
    type === 'wildcard' && wildcardPrefix !== 'none'
      ? out.map((e) => (e.url.includes('*') ? e : { ...e, url: wildcardPrefix + e.url }))
      : out;

  if (exempt.length && action !== 'exempt' && !entries.some((e) => e.action === 'exempt')) {
    warnings.push({ message: 'set exempt is only used when the action is exempt — ignored' });
  }
  // Under 'auto' the list may still hold simple entries, so only an explicit
  // non-simple type makes the setting pointless.
  if (includeSubdomains !== undefined && (type === 'wildcard' || type === 'regex')) {
    warnings.push({
      message: `set include-subdomains only applies to simple type entries, not ${type}`,
    });
  }

  let actionCounts: Partial<Record<UrlFilterAction, number>> | undefined;
  if (perEntryActions) {
    actionCounts = {};
    for (const e of entries) {
      const a = e.action ?? action;
      actionCounts[a] = (actionCounts[a] ?? 0) + 1;
    }
  }

  const output = entries.length
    ? emit(entries, {
        status,
        action,
        format,
        type,
        startId,
        listId,
        listName,
        comment,
        exempt,
        includeSubdomains,
        bindProfile,
        profileName,
      }) + '\n'
    : '';

  return {
    output,
    warnings,
    stats: {
      domains: out.length,
      duplicatesRemoved,
      wildcardEntries: entries.filter((e) => resolveType(e.url, type) === 'wildcard').length,
      actions: actionCounts,
    },
  };
}

interface EmitOptions {
  status: 'enable' | 'disable' | 'omit';
  action: UrlFilterAction;
  format: WebfilterFormat;
  type: UrlFilterType | 'auto' | undefined;
  startId: number;
  listId: number;
  listName: string;
  comment: string;
  exempt: ExemptFlag[];
  includeSubdomains: boolean | undefined;
  bindProfile: boolean;
  profileName: string;
}

/**
 * `set exempt` value, or '' when there is nothing to emit. Flags are ordered as
 * the admin guide lists them; `all` covers the rest so it is emitted alone.
 */
function exemptValue(exempt: ExemptFlag[]): string {
  if (!exempt.length) return '';
  if (exempt.includes('all')) return 'all';
  return EXEMPT_FLAGS.filter((f) => exempt.includes(f)).join(' ');
}

/** Render the entry list. Returns joined lines with no trailing newline. */
function emit(entries: Entry[], o: EmitOptions): string {
  const lines: string[] = [];
  const exempt = exemptValue(o.exempt);

  if (o.format === 'bare') {
    for (const e of entries) {
      const action = e.action ?? o.action;
      lines.push(`edit "${q(e.url)}"`);
      if (o.status !== 'omit') lines.push(`set status ${o.status}`);
      // The original script emits an action line only for exempt.
      if (action !== 'block') lines.push(`set action ${action}`);
      if (action === 'exempt' && exempt) lines.push(`set exempt ${exempt}`);
      const type = resolveType(e.url, o.type);
      if (type) lines.push(`set type ${type}`);
      lines.push('next');
    }
    return lines.join('\n');
  }

  // Numbered entries: the URL moves from the edit key to `set url`.
  const entry: string[] = [];
  entries.forEach((e, i) => {
    const action = e.action ?? o.action;
    entry.push(`edit ${o.startId + i}`);
    entry.push(`set url "${q(e.url)}"`);
    const type = resolveType(e.url, o.type);
    if (type) entry.push(`set type ${type}`);
    entry.push(`set action ${action}`);
    if (action === 'exempt' && exempt) entry.push(`set exempt ${exempt}`);
    if (o.status !== 'omit') entry.push(`set status ${o.status}`);
    entry.push('next');
  });

  if (o.format === 'entries') return entry.join('\n');

  // full: wrap the entries in a complete urlfilter list, indented like a
  // FortiGate `show` dump (4 spaces per level, `edit`/`next` bodies indented).
  lines.push('config webfilter urlfilter');
  lines.push(indent(1, `edit ${o.listId}`));
  lines.push(indent(2, `set name "${q(o.listName)}"`));
  if (o.comment) lines.push(indent(2, `set comment "${q(o.comment)}"`));
  if (o.includeSubdomains !== undefined) {
    lines.push(indent(2, `set include-subdomains ${o.includeSubdomains ? 'enable' : 'disable'}`));
  }
  lines.push(indent(2, 'config entries'));
  for (const line of entry) {
    // `edit`/`next` sit at level 3, their settings at level 4.
    const isEntryKey = line.startsWith('edit ') || line === 'next';
    lines.push(indent(isEntryKey ? 3 : 4, line));
  }
  lines.push(indent(2, 'end'));
  lines.push(indent(1, 'next'));
  lines.push('end');

  // Binding the list to a profile is what actually puts it in the traffic path.
  if (o.bindProfile) {
    lines.push('');
    lines.push('config webfilter profile');
    lines.push(indent(1, `edit "${q(o.profileName)}"`));
    lines.push(indent(2, 'config web'));
    lines.push(indent(3, `set urlfilter-table ${o.listId}`));
    lines.push(indent(2, 'end'));
    lines.push(indent(1, 'next'));
    lines.push('end');
  }

  return lines.join('\n');
}

function indent(level: number, line: string): string {
  return '    '.repeat(level) + line;
}
