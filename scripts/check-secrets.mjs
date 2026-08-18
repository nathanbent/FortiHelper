#!/usr/bin/env node
/**
 * Refuses to let credentials or customer identifiers reach a published repo.
 *
 * Scans exactly what `git ls-files` reports — the set of files that actually
 * get published — so anything gitignored (content/quickstart/private/, dist,
 * node_modules) is out of scope by construction.
 *
 * Run: npm run check-secrets
 *
 * Site-specific terms (client names, domains, hostnames, WAN blocks) do NOT
 * belong in this file: committing a denylist of secrets publishes the very
 * strings it exists to protect. Put them one per line in `.secrets-denylist`,
 * which is gitignored. Blank lines and # comments are ignored there.
 *
 * A line ending in `check-secrets-ok` is skipped, for the rare deliberate case.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const DENYLIST_FILE = '.secrets-denylist';

/** Files that are never text worth scanning. */
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|woff2?|ttf|eot|mp4|lock)$/i;

/** Public resolvers and services that legitimately appear in examples. */
const ALLOWED_IPS = new Set([
  '1.1.1.1', '1.0.0.1',           // Cloudflare
  '8.8.8.8', '8.8.4.4',           // Google
  '9.9.9.9', '149.112.112.112',   // Quad9
  '208.67.222.222', '208.67.220.220', // OpenDNS
  '0.0.0.0', '255.255.255.255',
]);

/** Ranges that cannot identify a real network. */
function isNonRoutable(ip) {
  const [a, b] = ip.split('.').map(Number);
  if ([10, 127].includes(a)) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a >= 224) return true;                                  // multicast, reserved
  if (a === 192 && b === 0) return true;                      // 192.0.2.0/24 docs
  if (a === 198 && b === 51) return true;                     // 198.51.100.0/24 docs
  if (a === 203 && b === 0) return true;                      // 203.0.113.0/24 docs
  if (a === 198 && (b === 18 || b === 19)) return true;        // benchmarking
  if (a === 100 && b >= 64 && b <= 127) return true;           // CGNAT
  if (a === 0) return true;
  return false;
}

/** A value is a placeholder, not a secret, when it looks like `<name>`. */
const PLACEHOLDER = /^["']?<[A-Za-z][A-Za-z0-9_.-]*>["']?$/;

const RULES = [
  {
    id: 'fortios-enc',
    what: 'a FortiOS ENC value (encrypted with a key that public tools have)',
    test: (line) => /\bENC\s+[A-Za-z0-9+/=]{20,}/.test(line),
  },
  {
    id: 'private-key',
    what: 'a PEM private key',
    test: (line) => /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(line),
  },
  {
    id: 'cloud-token',
    what: 'a cloud or service token',
    test: (line) =>
      /\bAKIA[0-9A-Z]{16}\b/.test(line) ||
      /\bgh[pousr]_[A-Za-z0-9]{20,}/.test(line) ||
      /\bxox[baprs]-[A-Za-z0-9-]{10,}/.test(line),
  },
  {
    id: 'fortios-credential',
    what: 'a FortiOS credential with a literal value',
    test: (line) => {
      const m = /\bset\s+(psksecret|password|passwd|auth-password|secondary-secret|primary-secret|ppk-secret|key)\s+(\S+)/.exec(
        line,
      );
      if (!m) return false;
      const value = m[2];
      // Placeholders and empty strings are how templates are meant to look.
      return !PLACEHOLDER.test(value) && value !== '""' && value !== "''";
    },
  },
  {
    id: 'public-ip',
    what: 'a routable IP address (use RFC 5737 documentation ranges in examples)',
    // Unit tests and golden fixtures carry mock resolver results, and a
    // byte-compared fixture cannot hold an inline marker without breaking the
    // comparison it exists for. Credentials and denylist terms are still
    // checked there — only this rule is scoped.
    skipPath: (file) => file.startsWith('tests/'),
    test: (line) => {
      for (const ip of line.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? []) {
        if (ip.split('.').some((o) => Number(o) > 255)) continue;
        if (ALLOWED_IPS.has(ip) || isNonRoutable(ip)) continue;
        return true;
      }
      return false;
    },
  },
];

/** Scan one file's text. Exported so the rules themselves can be tested. */
export function scanText(text, denylist = [], file = '') {
  const findings = [];
  text.split(/\r\n|[\n\r]/).forEach((line, i) => {
    if (line.includes('check-secrets-ok')) return;
    for (const rule of RULES) {
      if (rule.skipPath?.(file)) continue;
      if (rule.test(line)) findings.push({ line: i + 1, rule: rule.id, what: rule.what });
    }
    for (const term of denylist) {
      if (line.toLowerCase().includes(term.toLowerCase())) {
        findings.push({ line: i + 1, rule: 'denylist', what: `a denylisted term` });
      }
    }
  });
  return findings;
}

function loadDenylist() {
  if (!existsSync(DENYLIST_FILE)) return [];
  return readFileSync(DENYLIST_FILE, 'utf-8')
    .split(/\r\n|[\n\r]/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function main() {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf-8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !SKIP_EXT.test(f))
    // The rules below name the very patterns they look for.
    .filter((f) => f !== 'scripts/check-secrets.mjs' && f !== 'tests/check-secrets.test.ts');

  const denylist = loadDenylist();
  let total = 0;

  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf-8');
    } catch {
      continue; // unreadable or binary
    }
    for (const f of scanText(text, denylist, file)) {
      console.error(`${file}:${f.line}  [${f.rule}] ${f.what}`);
      total++;
    }
  }

  const scope = `${files.length} tracked files`;
  if (total > 0) {
    console.error(
      `\n${total} finding${total === 1 ? '' : 's'} across ${scope}.\n` +
        `Nothing here should reach a published repo. Move it to content/quickstart/private/,\n` +
        `replace it with a <placeholder>, or use a documentation address range.\n` +
        `A deliberate exception can end its line with check-secrets-ok.`,
    );
    process.exit(1);
  }
  console.log(
    `check-secrets: clean (${scope}${denylist.length ? `, ${denylist.length} denylist terms` : ', no denylist file'})`,
  );
}

// Only run when invoked directly, so the test can import scanText.
if (process.argv[1] && process.argv[1].endsWith('check-secrets.mjs')) main();
