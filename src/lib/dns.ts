import type { DnsResults } from './object-helper/types';

export type { DnsResults };

export interface ResolveOptions {
  /** Per-lookup timeout in milliseconds (default 3000). */
  timeoutMs?: number;
  /** Maximum concurrent lookups (default 10). */
  maxConcurrent?: number;
  /** Maximum A records kept per FQDN (default 20). */
  maxIps?: number;
  /** Progress callback: (completed, total). */
  onProgress?: (done: number, total: number) => void;
}

interface DoHAnswer {
  type?: number;
  data?: string;
}

interface DoHResponse {
  Status?: number;
  Answer?: DoHAnswer[];
}

/** Query one DNS-over-HTTPS JSON endpoint for A records. */
async function queryDoH(url: string, timeoutMs: number): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/dns-json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as DoHResponse;
    if (typeof data.Status === 'number' && data.Status !== 0) {
      throw new Error(`DNS error status ${data.Status}`);
    }
    const answers = Array.isArray(data.Answer) ? data.Answer : [];
    // Only type-1 (A) records.
    return answers
      .filter((a) => a.type === 1 && typeof a.data === 'string')
      .map((a) => a.data as string);
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve one FQDN: Cloudflare DoH first, Google DoH as fallback. */
async function resolveOne(fqdn: string, timeoutMs: number, maxIps: number): Promise<string[]> {
  const encoded = encodeURIComponent(fqdn);
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encoded}&type=A`,
    `https://dns.google/resolve?name=${encoded}&type=A`,
  ];
  let lastError: unknown = new Error('no DoH endpoints');
  for (const url of endpoints) {
    try {
      const ips = await queryDoH(url, timeoutMs);
      // Sorted unique, capped — same as the Python resolver.
      return [...new Set(ips)].sort().slice(0, maxIps);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/**
 * Resolve A records for the given FQDNs over DNS-over-HTTPS with bounded
 * concurrency. Failures never reject the returned promise; they become
 * `{ error: message }` entries per FQDN.
 */
export async function resolveFqdns(
  fqdns: string[],
  opts: ResolveOptions = {},
): Promise<DnsResults> {
  const timeoutMs = opts.timeoutMs ?? 3000;
  const maxConcurrent = opts.maxConcurrent ?? 10;
  const maxIps = opts.maxIps ?? 20;

  const unique = [...new Set(fqdns)];
  const results: DnsResults = {};
  let next = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (next < unique.length) {
      const fqdn = unique[next++];
      try {
        results[fqdn] = await resolveOne(fqdn, timeoutMs, maxIps);
      } catch (e) {
        results[fqdn] = { error: e instanceof Error ? e.message : String(e) };
      }
      done++;
      opts.onProgress?.(done, unique.length);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(maxConcurrent, unique.length || 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
