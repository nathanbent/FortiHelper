/**
 * Minimal IPv4 address/network parsing, mirroring the subset of Python's
 * `ipaddress` module behavior the original script relies on:
 *   - dotted-quad addresses only (four decimal octets, 0-255, no leading zeros)
 *   - "addr/prefixlen" networks (prefix 0-32, digits only)
 *   - "addr/netmask" and "addr/hostmask" networks (contiguous masks)
 *   - strict=false semantics: host bits are masked off
 * IPv6 (or anything else) simply fails to parse, so callers fall through to
 * FQDN validation, which produces a clear per-line warning.
 */

export interface IPv4Network {
  /** Network address (host bits masked off), dotted quad. */
  networkAddress: string;
  /** Dotted-quad netmask, e.g. "255.255.255.0". */
  netmask: string;
  prefixlen: number;
}

export interface IPv4Range {
  start: string;
  end: string;
}

/** Parse a dotted-quad IPv4 address to a uint32, or null if invalid. */
export function parseIPv4(s: string): number | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    // Python (>=3.9.5) rejects leading zeros in octets.
    if (part.length > 1 && part.startsWith('0')) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

/** Format a uint32 as a dotted-quad IPv4 address. */
export function formatIPv4(value: number): string {
  return [
    Math.floor(value / 16777216) % 256,
    Math.floor(value / 65536) % 256,
    Math.floor(value / 256) % 256,
    value % 256,
  ].join('.');
}

/** Netmask (as uint32) for a prefix length 0-32. */
export function netmaskFromPrefix(prefixlen: number): number {
  if (prefixlen === 0) return 0;
  // Avoid 32-bit shift pitfalls; compute arithmetically.
  return (0xffffffff - (2 ** (32 - prefixlen) - 1)) >>> 0;
}

const NETMASK_TO_PREFIX = new Map<number, number>();
const HOSTMASK_TO_PREFIX = new Map<number, number>();
for (let p = 0; p <= 32; p++) {
  const mask = netmaskFromPrefix(p);
  NETMASK_TO_PREFIX.set(mask, p);
  HOSTMASK_TO_PREFIX.set((0xffffffff - mask) >>> 0, p);
}

/**
 * Parse an IPv4 network like Python's `ip_network(s, strict=False)`.
 * Anything containing '-' is rejected up front so ranges can be handled
 * separately (same as the Python script's try_parse_ip_network).
 * Returns null when `s` is not a valid IPv4 address/network.
 */
export function tryParseIpNetwork(s: string): IPv4Network | null {
  s = s.trim();
  if (s.includes('-')) return null;

  const parts = s.split('/');
  if (parts.length > 2) return null;

  const addr = parseIPv4(parts[0]);
  if (addr === null) return null;

  let prefixlen = 32;
  if (parts.length === 2) {
    const suffix = parts[1];
    if (/^\d+$/.test(suffix)) {
      // Python allows leading zeros in the prefix length ("/024" is /24).
      const n = Number(suffix);
      if (n > 32) return null;
      prefixlen = n;
    } else {
      // Netmask (tried first) or hostmask notation, like Python's ipaddress.
      const maskValue = parseIPv4(suffix);
      if (maskValue === null) return null;
      const fromNet = NETMASK_TO_PREFIX.get(maskValue);
      const fromHost = HOSTMASK_TO_PREFIX.get(maskValue);
      if (fromNet !== undefined) prefixlen = fromNet;
      else if (fromHost !== undefined) prefixlen = fromHost;
      else return null;
    }
  }

  const mask = netmaskFromPrefix(prefixlen);
  // strict=false: mask off the host bits.
  const network = ((addr & mask) >>> 0);
  return {
    networkAddress: formatIPv4(network),
    netmask: formatIPv4(mask),
    prefixlen,
  };
}

/**
 * Parse an IPv4 range, mirroring the Python script's try_parse_ip_range:
 *   "10.0.0.1-10.0.0.9"  full start-end form
 *   "10.0.0.1-9"         last-octet shorthand (end = 10.0.0.9)
 * Requires end >= start. Returns null when not a valid range.
 */
export function tryParseIpRange(s: string): IPv4Range | null {
  s = s.trim();
  if (!s.includes('-')) return null;

  const sep = s.indexOf('-');
  const startStr = s.slice(0, sep).trim();
  const endStr = s.slice(sep + 1).trim();

  const start = parseIPv4(startStr);
  if (start === null) return null;

  let end = parseIPv4(endStr);
  if (end === null) {
    // Last-octet shorthand: "A.B.C.D-N" where N is 0-255 (digits only).
    if (/^\d+$/.test(endStr) && Number(endStr) <= 255) {
      const octets = startStr.split('.');
      octets[octets.length - 1] = endStr;
      end = parseIPv4(octets.join('.'));
      if (end === null) return null;
    } else {
      return null;
    }
  }

  if (end < start) return null;

  return { start: formatIPv4(start), end: formatIPv4(end) };
}
