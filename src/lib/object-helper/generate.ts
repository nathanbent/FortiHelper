import type { DnsResults, GenerateResult, ObjectHelperOptions } from './types';
import { MAX_OBJ_NAME_LEN, defaultResolvedAt, withDefaults } from './types';
import type { NormalizeIssues } from './normalize';
import { emptyIssues, fitName, normalizeRecords, uniqueName } from './normalize';
import type { IPv4Network, IPv4Range } from './ipv4';
import { tryParseIpNetwork, tryParseIpRange } from './ipv4';
import type { InputRecord, WarnSink } from './parse';
import {
  iterRecords,
  loadMeaningfulLines,
  makeWarningCollector,
  pyFormat,
  safeObjName,
  validateFqdn,
} from './parse';

interface Ctx {
  opts: ObjectHelperOptions;
  resolvedAt: string;
  warn: WarnSink;
  out: string[];
  issues: NormalizeIssues;
}

// ---------- naming helpers (mirror the Python helpers) ----------

/** safeObjName with the context's options; no length warning when names get shortened. */
function safe(ctx: Ctx, name: string): string {
  return safeObjName(name, ctx.warn, ctx.opts.sanitizeNames, !ctx.opts.shortenLongNames);
}

function buildBaseName(ctx: Ctx, nameFromInput: string | null, fqdn: string): string {
  const { opts } = ctx;
  // In the named modes a missing (null) name falls back to the FQDN — the
  // classic input formats always supply a string, so this only happens for
  // spreadsheet rows with an empty name cell.
  const raw = opts.useExplicitNames || opts.nameFqdnDelimiter ? (nameFromInput ?? fqdn) : fqdn;
  return applyPrefix(ctx, safe(ctx, raw));
}

function applyPrefix(ctx: Ctx, objName: string): string {
  const { opts } = ctx;
  if (opts.enablePrefix && opts.namePrefix) {
    return safe(ctx, `${opts.namePrefix}${opts.namePrefixDelim}${objName}`);
  }
  return objName;
}

/**
 * Resolve a group-name template: {prefix} is replaced with
 * "<prefix><delim>" when a prefix is active ("" otherwise); templates
 * without {prefix} get the active prefix prepended automatically.
 */
export function resolveGroupName(template: string, options: Partial<ObjectHelperOptions>): string {
  const opts = withDefaults(options);
  const prefixActive = opts.enablePrefix && opts.namePrefix;
  const prefixVal = prefixActive ? `${opts.namePrefix}${opts.namePrefixDelim}` : '';
  if (template.includes('{prefix}')) return pyFormat(template, { prefix: prefixVal });
  if (prefixActive) return `${prefixVal}${template}`;
  return template;
}

/** What a resolved-IP object's name adds to its FQDN object's base name. */
function ipObjTail(ctx: Ctx, ip: string, idx: number): string {
  const { opts } = ctx;
  if (opts.ipObjectsUseIndex) return `${opts.ipObjectSuffix}${idx}`;
  return `-${ip.replace(/\./g, '_')}`;
}

/**
 * The sanitized name `head + tail`. Over the FortiGate limit it is either
 * shortened (keeping the tail, so `-IP-1` / `-Group` survive) or, with
 * shortening off, counted as an issue — safeObjName has already warned.
 */
function finalName(ctx: Ctx, head: string, tail = ''): { name: string; full: string } {
  const full = safe(ctx, head + tail);
  if (full.length <= MAX_OBJ_NAME_LEN) return { name: full, full };
  if (!ctx.opts.shortenLongNames) {
    ctx.issues.longNames++;
    return { name: full, full };
  }
  const keepTail = tail !== '' && full.endsWith(tail);
  const name = keepTail ? fitName(full.slice(0, -tail.length), tail) : fitName(full);
  return { name, full };
}

function makePerFqdnGroupName(ctx: Ctx, lineno: number, baseName: string): string {
  const { name, full } = finalName(ctx, baseName, ctx.opts.perFqdnGroupSuffix);
  if (name !== full) {
    ctx.warn(`Shortened group name '${full}' to '${name}' (FortiGate limit is 79 characters)`, lineno, 'fix');
  }
  return name;
}

// ---------- comment helpers ----------

function renderTemplate(
  template: string,
  inputComment: string | null,
  vars: Record<string, string>,
): string | null {
  if (!template) return inputComment || null;
  const result = pyFormat(template, { comment: inputComment ?? '', ...vars });
  return result || null;
}

/**
 * Add the bulk comment to whatever the templates produced: appended to an
 * existing comment, or standing alone when the object has none.
 */
function applyBulkComment(ctx: Ctx, comment: string | null): string | null {
  // `enableComment` is the master switch for object comments.
  if (!ctx.opts.enableComment) return comment;
  const bulk = ctx.opts.bulkComment.trim();
  if (!bulk) return comment;
  return comment ? `${comment}${ctx.opts.bulkCommentSeparator}${bulk}` : bulk;
}

function renderAddressComment(
  ctx: Ctx,
  fqdn: string | null,
  ip: string | null,
  inputComment: string | null,
): string | null {
  if (!ctx.opts.enableComment) return null;

  // Direct IP input (no FQDN)
  if (fqdn === null && ip !== null) {
    return renderTemplate(ctx.opts.commentTemplateDirectIp, inputComment, { ip });
  }
  if (ip === null) {
    return renderTemplate(ctx.opts.commentTemplateFqdn, inputComment, { fqdn: fqdn ?? '' });
  }
  return renderTemplate(ctx.opts.commentTemplateIp, inputComment, {
    fqdn: fqdn ?? '',
    ip,
    resolved_at: ctx.resolvedAt,
  });
}

// ---------- write helpers ----------

function writeAddressCommonOptions(
  ctx: Ctx,
  fqdn: string | null,
  ip: string | null,
  isFqdnObj: boolean,
  inputComment: string | null,
): void {
  const { opts, out } = ctx;
  let comment = applyBulkComment(ctx, renderAddressComment(ctx, fqdn, ip, inputComment));
  if (comment) {
    comment = comment.replace(/"/g, "'");
    out.push(`set comment "${comment}"\n`);
  }

  if (opts.enableAssociatedInterface && opts.associatedInterface) {
    out.push(`set associated-interface "${opts.associatedInterface}"\n`);
  }

  if (opts.enableColor) out.push(`set color ${Math.trunc(opts.colorId)}\n`);

  if (opts.enableAllowRouting) out.push('set allow-routing enable\n');

  if (opts.enableFabricObject) out.push('set fabric-object enable\n');

  if (isFqdnObj) {
    if (opts.enablePassiveFqdnLearning) out.push('set passive-fqdn-learning enable\n');
    if (opts.enableCacheTtl) out.push(`set cache-ttl ${Math.trunc(opts.cacheTtlSeconds)}\n`);
  }
}

function writeFqdnObject(ctx: Ctx, objName: string, fqdn: string, inputComment: string | null): void {
  ctx.out.push(`edit "${objName}"\n`, 'set type fqdn\n', `set fqdn "${fqdn}"\n`);
  writeAddressCommonOptions(ctx, fqdn, null, true, inputComment);
  ctx.out.push('next\n\n');
}

function writeIpObject(
  ctx: Ctx,
  objName: string,
  fqdn: string,
  ip: string,
  inputComment: string | null,
): void {
  ctx.out.push(`edit "${objName}"\n`, `set subnet ${ip} 255.255.255.255\n`);
  writeAddressCommonOptions(ctx, fqdn, ip, false, inputComment);
  ctx.out.push('next\n\n');
}

function writeDirectIpObject(
  ctx: Ctx,
  objName: string,
  network: IPv4Network,
  inputComment: string | null,
): void {
  ctx.out.push(`edit "${objName}"\n`, `set subnet ${network.networkAddress} ${network.netmask}\n`);
  writeAddressCommonOptions(ctx, null, network.networkAddress, false, inputComment);
  ctx.out.push('next\n\n');
}

function writeIpRangeObject(
  ctx: Ctx,
  objName: string,
  range: IPv4Range,
  inputComment: string | null,
): void {
  ctx.out.push(
    `edit "${objName}"\n`,
    'set type iprange\n',
    `set start-ip ${range.start}\n`,
    `set end-ip ${range.end}\n`,
  );
  writeAddressCommonOptions(ctx, null, `${range.start}-${range.end}`, false, inputComment);
  ctx.out.push('next\n\n');
}

function writeAddrgrpBlock(ctx: Ctx, groupName: string, members: string[]): void {
  if (!members.length) return;
  const { opts, out } = ctx;

  out.push(`edit "${safeObjName(groupName, ctx.warn, ctx.opts.sanitizeNames)}"\n`);

  if (opts.enableGroupType && opts.groupType) out.push(`set type ${opts.groupType}\n`);

  if (opts.enableGroupCategory && opts.groupCategory) {
    out.push(`set category ${opts.groupCategory}\n`);
  }

  if (opts.enableGroupComment && opts.groupCommentTemplate) {
    const comment = pyFormat(opts.groupCommentTemplate, { resolved_at: ctx.resolvedAt }).replace(
      /"/g,
      "'",
    );
    out.push(`set comment "${comment}"\n`);
  }

  if (opts.enableGroupColor) out.push(`set color ${Math.trunc(opts.groupColorId)}\n`);

  if (opts.enableGroupFabricObject) out.push('set fabric-object enable\n');

  out.push(`set member ${members.map((m) => `"${m}"`).join(' ')}\n`, 'next\n\n');
}

// ---------- FQDN collection for the UI's DNS pre-resolution ----------

/**
 * The FQDNs that would need DNS resolution for the given input/options
 * (direct IPs, ranges, wildcards, and invalid entries excluded). Mirrors
 * the Python script's pre-resolution scan; duplicates are collapsed.
 */
export function collectFqdnsToResolve(
  input: string,
  options: Partial<ObjectHelperOptions> = {},
): string[] {
  const opts = withDefaults(options);
  const lines = loadMeaningfulLines(input);
  return collectFqdnsFromRecords(iterRecords(lines, opts, () => {}), options);
}

/** Same scan as collectFqdnsToResolve, over already-parsed records. */
export function collectFqdnsFromRecords(
  records: InputRecord[],
  options: Partial<ObjectHelperOptions> = {},
): string[] {
  const opts = withDefaults(options);
  const fqdns = new Set<string>();
  for (const record of normalizeRecords(records, opts, () => {})) {
    try {
      if (tryParseIpNetwork(record.value)) continue;
      if (tryParseIpRange(record.value)) continue;
      const fqdn = validateFqdn(record.value, opts);
      if (!fqdn.startsWith('*.')) fqdns.add(fqdn);
    } catch {
      // invalid entries are reported during generation, not here
    }
  }
  return [...fqdns];
}

// ---------- main generation ----------

/**
 * Pure, synchronous port of format_fqdn_and_ip_objects(). DNS results are
 * injected via `dns` (fqdn -> ips or {error}); when `outputIpObjects` is on
 * and an FQDN is missing from `dns`, a "no A records" warning is produced,
 * exactly like a cache miss in the Python script.
 */
export function generateObjects(
  input: string,
  options: Partial<ObjectHelperOptions> = {},
  dns: DnsResults = {},
): GenerateResult {
  const opts = withDefaults(options);
  const { warnings, warn } = makeWarningCollector();
  const lines = loadMeaningfulLines(input);
  const records = iterRecords(lines, opts, warn);
  return generateCore(records, opts, dns, warnings, warn);
}

/**
 * Generation over already-parsed records — the spreadsheet input mode
 * builds its records from pasted cells rather than lines of text.
 * Behavior past parsing is identical to generateObjects().
 */
export function generateFromRecords(
  records: InputRecord[],
  options: Partial<ObjectHelperOptions> = {},
  dns: DnsResults = {},
): GenerateResult {
  const opts = withDefaults(options);
  const { warnings, warn } = makeWarningCollector();
  return generateCore(records, opts, dns, warnings, warn);
}

function generateCore(
  records: InputRecord[],
  opts: ObjectHelperOptions,
  dns: DnsResults,
  warnings: GenerateResult['warnings'],
  warn: WarnSink,
): GenerateResult {
  const resolvedAt = opts.resolvedAt ?? defaultResolvedAt();
  const out: string[] = [];
  const issues = emptyIssues();
  const ctx: Ctx = { opts, resolvedAt, warn, out, issues };
  records = normalizeRecords(records, opts, warn, issues);

  let writtenFqdn = 0;
  let writtenIp = 0;
  let writtenDirectIp = 0;
  let writtenIpRange = 0;
  let skipped = 0;
  let duplicates = 0;
  let dnsFailures = 0;

  const createdObjects: string[] = [];
  /** Object name -> what it holds and the line that created it. */
  const createdObjectNames = new Map<string, { sig: string; line: number }>();

  /**
   * Final, unique name for a new object, or null when the row is skipped.
   * `sig` identifies the address: a name reused for the same address is a
   * plain duplicate, one reused for a different address is a conflict —
   * renamed with renameDuplicateNames (or when shortening caused it),
   * otherwise skipped with a warning.
   */
  const claim = (head: string, tail: string, sig: string, lineno: number): string | null => {
    const { name: fitted, full } = finalName(ctx, head, tail);
    const shortened = fitted !== full;
    let name = fitted;
    const existing = createdObjectNames.get(name);
    if (existing) {
      if (existing.sig === sig) {
        duplicates++;
        warn(
          `Duplicate object name skipped: '${name}' — same address as line ${existing.line}`,
          lineno,
          'fix',
        );
        return null;
      }
      if (!shortened && !opts.renameDuplicateNames) {
        duplicates++;
        issues.nameConflicts++;
        warn(
          `Duplicate object name skipped: '${name}' — line ${existing.line} already uses it ` +
            'for a different address',
          lineno,
        );
        return null;
      }
      name = uniqueName(name, (n) => createdObjectNames.has(n));
      if (!shortened) {
        warn(
          `Renamed '${fitted}' to '${name}' — line ${existing.line} already uses that name ` +
            'for a different address',
          lineno,
          'fix',
        );
      }
    }
    if (shortened) {
      warn(`Shortened '${full}' to '${name}' (FortiGate limit is 79 characters)`, lineno, 'fix');
    }
    createdObjectNames.set(name, { sig, line: lineno });
    createdObjects.push(name);
    return name;
  };
  const perFqdnGroups: [string, string[]][] = [];
  const placeholdersSkipped: string[] = [];

  if (opts.startWithConfigFirewallAddress) out.push('config firewall address\n');

  for (const record of records) {
    const { lineno, name: nameLine, value: fqdnLine, comment: inputComment } = record;
    try {
      // Direct IP / CIDR inputs — no DNS, no FQDN object
      const network = tryParseIpNetwork(fqdnLine);
      if (network !== null) {
        let rawName: string;
        if (nameLine) rawName = nameLine;
        else if (network.prefixlen === 32) rawName = network.networkAddress;
        else rawName = `${network.networkAddress}${opts.ipCidrSeparator}${network.prefixlen}`;
        const baseObjName = applyPrefix(ctx, safe(ctx, rawName));
        // 0.0.0.0/32 is what exports emit for an unconfigured interface —
        // FortiGate accepts it, but it almost never means anything.
        const isPlaceholder = network.prefixlen === 32 && network.networkAddress === '0.0.0.0';
        if (isPlaceholder && opts.skipPlaceholderIps) {
          skipped++;
          placeholdersSkipped.push(baseObjName);
          continue;
        }
        const sig = `net:${network.networkAddress}/${network.netmask}`;
        const objName = claim(baseObjName, '', sig, lineno);
        if (objName !== null) {
          writeDirectIpObject(ctx, objName, network, inputComment);
          writtenDirectIp++;
          if (isPlaceholder) {
            warn(
              `Warning: '${objName}' is 0.0.0.0/32 — likely an unconfigured ` +
                `placeholder in the source export.`,
              lineno,
            );
          }
          if (opts.enablePerFqdnGroup) {
            perFqdnGroups.push([makePerFqdnGroupName(ctx, lineno, objName), [objName]]);
          }
        }
        continue;
      }

      // IP ranges (e.g. "10.0.0.1-10.0.0.9") — no DNS, no FQDN object
      const ipRange = tryParseIpRange(fqdnLine);
      if (ipRange !== null) {
        const rawName = nameLine ? nameLine : `${ipRange.start}-${ipRange.end}`;
        const sig = `range:${ipRange.start}-${ipRange.end}`;
        const objName = claim(applyPrefix(ctx, safe(ctx, rawName)), '', sig, lineno);
        if (objName !== null) {
          writeIpRangeObject(ctx, objName, ipRange, inputComment);
          writtenIpRange++;
          if (opts.enablePerFqdnGroup) {
            perFqdnGroups.push([makePerFqdnGroupName(ctx, lineno, objName), [objName]]);
          }
        }
        continue;
      }

      const fqdn = validateFqdn(fqdnLine, opts);
      const baseName = buildBaseName(ctx, nameLine, fqdn);

      const thisRecordMembers: string[] = [];

      if (opts.outputFqdnObjects) {
        const objName = claim(baseName, '', `fqdn:${fqdn}`, lineno);
        if (objName !== null) {
          writeFqdnObject(ctx, objName, fqdn, inputComment);
          thisRecordMembers.push(objName);
          writtenFqdn++;
        }
      }

      if (opts.outputIpObjects) {
        if (fqdn.startsWith('*.')) {
          warn(`Wildcard '${fqdn}' not resolvable; skipping IP objects.`, lineno);
        } else {
          const result = dns[fqdn];
          let ips: string[];
          if (result && !Array.isArray(result)) {
            dnsFailures++;
            warn(`DNS resolve failed for '${fqdn}': ${result.error}`, lineno);
            ips = [];
          } else if (!result || result.length === 0) {
            warn(`No IPv4 A records found for '${fqdn}'.`, lineno);
            ips = [];
          } else {
            // The Python resolver caps at max_ips_per_fqdn before caching;
            // apply the same cap to injected results.
            ips = result.slice(0, opts.maxIpsPerFqdn);
          }

          ips.forEach((ip, i) => {
            const idx = i + 1;
            const ipObjName = claim(baseName, ipObjTail(ctx, ip, idx), `ip:${ip}`, lineno);
            if (ipObjName === null) return;
            writeIpObject(ctx, ipObjName, fqdn, ip, inputComment);
            thisRecordMembers.push(ipObjName);
            writtenIp++;
          });
        }
      }

      if (opts.enablePerFqdnGroup && thisRecordMembers.length) {
        perFqdnGroups.push([makePerFqdnGroupName(ctx, lineno, baseName), thisRecordMembers]);
      }
    } catch (e) {
      skipped++;
      const who = nameLine !== null ? `name='${nameLine}' ` : '';
      let msg = e instanceof Error ? e.message : String(e);
      if (!opts.normalizeAddresses && msg.includes('looks like a URL')) {
        msg += ' — or turn on "Clean up URLs"';
      }
      warn(`Skipped ${who}fqdn='${fqdnLine}': ${msg}`, lineno);
    }
  }

  // One summary line instead of a warning per dropped row — a SonicWall
  // export can carry dozens of these stubs.
  if (placeholdersSkipped.length) {
    warn(
      `Skipped ${placeholdersSkipped.length} 0.0.0.0/32 object(s) — unconfigured ` +
        `placeholders in the source export: ${placeholdersSkipped.join(', ')}`,
    );
  }

  if (opts.endConfigFirewallAddress) out.push('end\n\n');

  let groupBlocksWritten = false;

  if (opts.enablePerFqdnGroup && perFqdnGroups.length) {
    out.push('config firewall addrgrp\n');
    for (const [groupName, members] of perFqdnGroups) {
      writeAddrgrpBlock(ctx, groupName, members);
    }
    groupBlocksWritten = true;
  }

  if (opts.enableAllObjectsGroup) {
    if (!groupBlocksWritten) out.push('config firewall addrgrp\n');
    writeAddrgrpBlock(ctx, resolveGroupName(opts.allObjectsGroupName, opts), createdObjects);
    groupBlocksWritten = true;
  }

  if (groupBlocksWritten) out.push('end\n');

  return {
    output: out.join(''),
    warnings,
    stats: {
      writtenFqdn,
      writtenIp,
      writtenDirectIp,
      writtenIpRange,
      skipped,
      duplicates,
      dnsFailures,
      total: createdObjects.length,
      resolvedAt,
    },
    issues,
  };
}
