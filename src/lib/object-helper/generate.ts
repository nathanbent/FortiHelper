import type { DnsResults, GenerateResult, ObjectHelperOptions } from './types';
import { defaultResolvedAt, withDefaults } from './types';
import type { IPv4Network, IPv4Range } from './ipv4';
import { tryParseIpNetwork, tryParseIpRange } from './ipv4';
import type { WarnSink } from './parse';
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
}

// ---------- naming helpers (mirror the Python helpers) ----------

function buildBaseName(ctx: Ctx, nameFromInput: string | null, fqdn: string): string {
  const { opts } = ctx;
  const raw = opts.useExplicitNames || opts.nameFqdnDelimiter ? (nameFromInput ?? '') : fqdn;
  const base = safeObjName(raw, ctx.warn);
  if (opts.enablePrefix && opts.namePrefix) {
    return safeObjName(`${opts.namePrefix}${opts.namePrefixDelim}${base}`, ctx.warn);
  }
  return base;
}

function applyPrefix(ctx: Ctx, objName: string): string {
  const { opts } = ctx;
  if (opts.enablePrefix && opts.namePrefix) {
    return safeObjName(`${opts.namePrefix}${opts.namePrefixDelim}${objName}`, ctx.warn);
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

function makeIpObjName(ctx: Ctx, baseName: string, ip: string, idx: number): string {
  const { opts } = ctx;
  if (opts.ipObjectsUseIndex) {
    return safeObjName(`${baseName}${opts.ipObjectSuffix}${idx}`, ctx.warn);
  }
  return safeObjName(`${baseName}-${ip.replace(/\./g, '_')}`, ctx.warn);
}

function makePerFqdnGroupName(ctx: Ctx, baseName: string): string {
  return safeObjName(`${baseName}${ctx.opts.perFqdnGroupSuffix}`, ctx.warn);
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

  out.push(`edit "${safeObjName(groupName, ctx.warn)}"\n`);

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
  const records = iterRecords(lines, opts, () => {});
  const fqdns = new Set<string>();
  for (const record of records) {
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
  const resolvedAt = opts.resolvedAt ?? defaultResolvedAt();
  const { warnings, warn } = makeWarningCollector();
  const out: string[] = [];
  const ctx: Ctx = { opts, resolvedAt, warn, out };

  let writtenFqdn = 0;
  let writtenIp = 0;
  let writtenDirectIp = 0;
  let writtenIpRange = 0;
  let skipped = 0;
  let duplicates = 0;
  let dnsFailures = 0;

  const createdObjects: string[] = [];
  const createdObjectNames = new Set<string>();
  const perFqdnGroups: [string, string[]][] = [];

  const lines = loadMeaningfulLines(input);
  const records = iterRecords(lines, opts, warn);

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
        const objName = applyPrefix(ctx, safeObjName(rawName, warn));
        if (createdObjectNames.has(objName)) {
          duplicates++;
          warn(`Duplicate object name skipped: '${objName}'`, lineno);
        } else {
          writeDirectIpObject(ctx, objName, network, inputComment);
          createdObjectNames.add(objName);
          createdObjects.push(objName);
          writtenDirectIp++;
          if (opts.enablePerFqdnGroup) {
            perFqdnGroups.push([makePerFqdnGroupName(ctx, objName), [objName]]);
          }
        }
        continue;
      }

      // IP ranges (e.g. "10.0.0.1-10.0.0.9") — no DNS, no FQDN object
      const ipRange = tryParseIpRange(fqdnLine);
      if (ipRange !== null) {
        const rawName = nameLine ? nameLine : `${ipRange.start}-${ipRange.end}`;
        const objName = applyPrefix(ctx, safeObjName(rawName, warn));
        if (createdObjectNames.has(objName)) {
          duplicates++;
          warn(`Duplicate object name skipped: '${objName}'`, lineno);
        } else {
          writeIpRangeObject(ctx, objName, ipRange, inputComment);
          createdObjectNames.add(objName);
          createdObjects.push(objName);
          writtenIpRange++;
          if (opts.enablePerFqdnGroup) {
            perFqdnGroups.push([makePerFqdnGroupName(ctx, objName), [objName]]);
          }
        }
        continue;
      }

      const fqdn = validateFqdn(fqdnLine, opts);
      const baseName = buildBaseName(ctx, nameLine, fqdn);

      const thisRecordMembers: string[] = [];

      if (opts.outputFqdnObjects) {
        if (createdObjectNames.has(baseName)) {
          duplicates++;
          warn(`Duplicate object name skipped: '${baseName}'`, lineno);
        } else {
          writeFqdnObject(ctx, baseName, fqdn, inputComment);
          createdObjectNames.add(baseName);
          createdObjects.push(baseName);
          thisRecordMembers.push(baseName);
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
            const ipObjName = makeIpObjName(ctx, baseName, ip, idx);
            if (createdObjectNames.has(ipObjName)) {
              duplicates++;
              warn(`Duplicate object name skipped: '${ipObjName}'`, lineno);
              return;
            }
            writeIpObject(ctx, ipObjName, fqdn, ip, inputComment);
            createdObjectNames.add(ipObjName);
            createdObjects.push(ipObjName);
            thisRecordMembers.push(ipObjName);
            writtenIp++;
          });
        }
      }

      if (opts.enablePerFqdnGroup && thisRecordMembers.length) {
        perFqdnGroups.push([makePerFqdnGroupName(ctx, baseName), thisRecordMembers]);
      }
    } catch (e) {
      skipped++;
      const who = nameLine !== null ? `name='${nameLine}' ` : '';
      const msg = e instanceof Error ? e.message : String(e);
      warn(`Skipped ${who}fqdn='${fqdnLine}': ${msg}`, lineno);
    }
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
  };
}
