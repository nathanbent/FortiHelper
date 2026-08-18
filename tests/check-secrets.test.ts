import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain JS script, no types, imported for its rules.
import { scanText } from '../scripts/check-secrets.mjs';

/** Rule ids found in some text. */
function rules(text: string, denylist: string[] = [], file = 'content/x.md'): string[] {
  return (scanText(text, denylist, file) as { rule: string }[]).map((f) => f.rule);
}

describe('check-secrets catches what it is for', () => {
  it('flags a FortiOS ENC blob', () => {
    expect(rules('set psksecret ENC 2Dpl394z0ugpLyaIbKEU3CxmQx4bXIyeOfTVrP2seAxuAF6JK')).toContain(
      'fortios-enc',
    );
  });

  it('flags a literal psksecret', () => {
    expect(rules('        set psksecret Sup3rSecretKey')).toContain('fortios-credential');
  });

  it('flags other credential keys with literal values', () => {
    for (const key of ['password', 'passwd', 'auth-password', 'ppk-secret']) {
      expect(rules(`set ${key} hunter2`), key).toContain('fortios-credential');
    }
  });

  it('flags PEM private keys and cloud tokens', () => {
    expect(rules('-----BEGIN RSA PRIVATE KEY-----')).toContain('private-key');
    expect(rules('AKIAIOSFODNN7EXAMPLE')).toContain('cloud-token');
    expect(rules('ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toContain('cloud-token');
  });

  it('flags a routable IP address', () => {
    expect(rules('set ip 24.248.244.32 255.255.255.224')).toContain('public-ip');
  });

  it('flags a denylisted term, case-insensitively', () => {
    expect(rules('# notes for ExampleCorp', ['examplecorp'])).toContain('denylist');
  });
});

describe('check-secrets stays quiet on what belongs', () => {
  it('accepts placeholders in place of credentials', () => {
    expect(rules('        set psksecret <pre-shared-key>')).toEqual([]);
    expect(rules('        set password "<admin-password>"')).toEqual([]);
    expect(rules('        set psksecret ""')).toEqual([]);
  });

  it('accepts private, documentation, and CGNAT addressing', () => {
    for (const ip of [
      '10.10.0.1', '192.168.1.1', '172.16.5.4', '127.0.0.1', '169.254.1.1',
      '192.0.2.10', '198.51.100.10', '203.0.113.5', '100.64.0.1', '224.0.0.1',
      '0.0.0.0', '255.255.255.0',
    ]) {
      expect(rules(`set ip ${ip}`), ip).toEqual([]);
    }
  });

  it('accepts well-known public resolvers used in examples', () => {
    for (const ip of ['1.1.1.1', '8.8.8.8', '9.9.9.9', '149.112.112.112']) {
      expect(rules(`set primary ${ip}`), ip).toEqual([]);
    }
  });

  it('ignores a line marked as a deliberate exception', () => {
    expect(rules('set psksecret Sup3rSecret  # check-secrets-ok')).toEqual([]);
  });

  it('scopes the IP rule away from tests, but not the credential rules', () => {
    const line = 'const dns = { a: ["93.184.216.34"] };';
    expect(rules(line, [], 'tests/object-helper.test.ts')).toEqual([]);
    expect(rules(line, [], 'content/quickstart/x.md')).toContain('public-ip');
    // Credentials are never acceptable, wherever they are.
    expect(rules('set psksecret literal', [], 'tests/x.test.ts')).toContain('fortios-credential');
  });

  it('does not flag an octet-like string that is not an address', () => {
    expect(rules('version 999.999.999.999')).toEqual([]);
  });
});
