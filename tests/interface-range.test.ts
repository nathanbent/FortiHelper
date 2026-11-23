import { describe, expect, it } from 'vitest';
import {
  MAX_RANGE,
  expandRange,
  generateInterfaceRange,
  parseCommands,
} from '../src/lib/interface-range';

describe('expandRange', () => {
  it('expands full and short ranges, in the order written', () => {
    expect(expandRange('port1-port3,port10-11').names).toEqual([
      'port1',
      'port2',
      'port3',
      'port10',
      'port11',
    ]);
  });

  it('accepts spaces, new lines, and single names', () => {
    expect(expandRange('port1 - port2\nx1 wan1;internal3-4').names).toEqual([
      'port1',
      'port2',
      'x1',
      'wan1',
      'internal3',
      'internal4',
    ]);
  });

  it('keeps names that contain a hyphen but are not ranges', () => {
    expect(expandRange('wan1-backup, lan-a').names).toEqual(['wan1-backup', 'lan-a']);
  });

  it('splits chassis-style names at the right hyphen', () => {
    expect(expandRange('1-P1-1-P3').names).toEqual(['1-P1', '1-P2', '1-P3']);
  });

  it('handles slashes and zero padding', () => {
    expect(expandRange('port1/1-4').names).toEqual(['port1/1', 'port1/2', 'port1/3', 'port1/4']);
    expect(expandRange('ge08-ge10').names).toEqual(['ge08', 'ge09', 'ge10']);
  });

  it('turns a countdown around and notes it', () => {
    const r = expandRange('port3-port1');
    expect(r.names).toEqual(['port1', 'port2', 'port3']);
    expect(r.warnings[0].kind).toBe('fix');
  });

  it('drops repeats and a leading Cisco interface range', () => {
    const r = expandRange('interface range port1-3, port2');
    expect(r.names).toEqual(['port1', 'port2', 'port3']);
    expect(r.warnings.every((w) => w.kind === 'fix')).toBe(true);
    expect(r.warnings).toHaveLength(2);
  });

  it('refuses a runaway range', () => {
    const r = expandRange(`port1-${MAX_RANGE + 1}`);
    expect(r.names).toEqual([]);
    expect(r.warnings[0].message).toMatch(/limit/);
  });

  it('warns about Cisco interface names', () => {
    const r = expandRange('Gi1/0/1-24');
    expect(r.names).toHaveLength(24);
    expect(r.warnings[0].message).toMatch(/Cisco/);
  });
});

describe('parseCommands', () => {
  it('indents nested config blocks and closes any left open', () => {
    const r = parseCommands(
      ['set vlan "vlan10"', 'config port-security', 'set port-security-mode 802.1X'].join('\n'),
      'managed-switch',
    );
    expect(r.lines).toEqual([
      'set vlan "vlan10"',
      'config port-security',
      '    set port-security-mode 802.1X',
      'end',
    ]);
    expect(r.warnings[0].kind).toBe('fix');
  });

  it('indents edit blocks inside a nested config', () => {
    const r = parseCommands(['config ipv4', 'edit 1', 'set ip 192.0.2.1/32', 'next', 'end'].join('\n'), 'fortigate');
    expect(r.lines).toEqual(['config ipv4', '    edit 1', '        set ip 192.0.2.1/32', '    next', 'end']);
    expect(r.warnings).toEqual([]);
  });

  it('drops a top-level edit, next, or end', () => {
    const r = parseCommands(['edit "port1"', 'set status down', 'next', 'end'].join('\n'), 'fortigate');
    expect(r.lines).toEqual(['set status down']);
    expect(r.warnings).toHaveLength(3);
  });

  it('points Cisco syntax at the FortiOS equivalent', () => {
    const r = parseCommands('switchport access vlan 10\nshutdown', 'managed-switch');
    expect(r.warnings[0].message).toMatch(/set vlan/);
    expect(r.warnings[1].message).toMatch(/set status down/);
  });

  it('skips blank lines and comments', () => {
    expect(parseCommands('# note\n\n  set status up  \n', 'fortigate').lines).toEqual(['set status up']);
  });
});

describe('generateInterfaceRange', () => {
  it('wraps FortiGate interfaces in config system interface', () => {
    const { output } = generateInterfaceRange('port1-2', 'set status down', { target: 'fortigate' });
    expect(output).toBe(
      [
        'config system interface',
        '    edit "port1"',
        '        set status down',
        '    next',
        '    edit "port2"',
        '        set status down',
        '    next',
        'end',
      ].join('\n'),
    );
  });

  it('nests managed switch ports under each switch', () => {
    const { output, stats } = generateInterfaceRange('port1', 'set vlan "vlan10"', {
      target: 'managed-switch',
      switchIds: 'S248EPTF00000001, S248EPTF00000002',
    });
    expect(stats.switches).toBe(2);
    expect(output).toBe(
      [
        'config switch-controller managed-switch',
        '    edit "S248EPTF00000001"',
        '        config ports',
        '            edit "port1"',
        '                set vlan "vlan10"',
        '            next',
        '        end',
        '    next',
        '    edit "S248EPTF00000002"',
        '        config ports',
        '            edit "port1"',
        '                set vlan "vlan10"',
        '            next',
        '        end',
        '    next',
        'end',
      ].join('\n'),
    );
  });

  it('leaves a placeholder and a warning without a switch ID', () => {
    const r = generateInterfaceRange('port1', 'set vlan "vlan10"', { target: 'managed-switch' });
    expect(r.output).toContain('    edit <switch-id>');
    expect(r.warnings.some((w) => /switch ID/.test(w.message))).toBe(true);
  });

  it('uses config switch interface on a standalone FortiSwitch', () => {
    const { output } = generateInterfaceRange('port1', 'set native-vlan 10', { target: 'fortiswitch' });
    expect(output.split('\n')[0]).toBe('config switch interface');
  });

  it('fills {port}, {n}, and {i}', () => {
    const { output } = generateInterfaceRange('port7-8', 'set description "{port} desk {n} #{i}"', {
      target: 'fortigate',
    });
    expect(output).toContain('set description "port7 desk 7 #1"');
    expect(output).toContain('set description "port8 desk 8 #2"');
  });

  it('emits nothing until there are both interfaces and commands', () => {
    expect(generateInterfaceRange('port1-4', '', { target: 'fortigate' }).output).toBe('');
    expect(generateInterfaceRange('', 'set status up', { target: 'fortigate' }).output).toBe('');
    expect(generateInterfaceRange('port1-4', '', { target: 'fortigate' }).names).toHaveLength(4);
  });
});

describe('expandRange filters', () => {
  it('keeps odd or even numbers of one item', () => {
    expect(expandRange('port1-8:odd').names).toEqual(['port1', 'port3', 'port5', 'port7']);
    expect(expandRange('port1-port8 : even').names).toEqual(['port2', 'port4', 'port6', 'port8']);
  });

  it('steps from the start of a range', () => {
    expect(expandRange('port1-12:step4').names).toEqual(['port1', 'port5', 'port9']);
    expect(expandRange('port2-10:every3').names).toEqual(['port2', 'port5', 'port8']);
  });

  it('leaves out ! items wherever they appear', () => {
    expect(expandRange('!port3, port1-6, !port5-6').names).toEqual(['port1', 'port2', 'port4']);
    expect(expandRange('port1-6, !port1-6:even').names).toEqual(['port1', 'port3', 'port5']);
  });

  it('warns about a filter it does not know', () => {
    const r = expandRange('port1-4:prime');
    expect(r.names).toHaveLength(4);
    expect(r.warnings[0].message).toMatch(/not a filter/);
  });

  it('applies a list-wide odd or even filter, keeping names with no number', () => {
    expect(expandRange('port1-4, x1-2, mgmt', { only: 'even' }).names).toEqual([
      'port2',
      'port4',
      'x2',
      'mgmt',
    ]);
  });

  it('sorts by name, then number', () => {
    expect(expandRange('port10, x2, port2, x1', { sort: true }).names).toEqual([
      'port2',
      'port10',
      'x1',
      'x2',
    ]);
  });
});

describe('generateInterfaceRange output shape', () => {
  it('emits only config ports for a managed switch', () => {
    const r = generateInterfaceRange('port1', 'set status down', { target: 'managed-switch', wrap: 'ports' });
    expect(r.output).toBe(
      ['config ports', '    edit "port1"', '        set status down', '    next', 'end'].join('\n'),
    );
    expect(r.warnings).toEqual([]);
  });

  it('emits only the edit blocks', () => {
    const r = generateInterfaceRange('port1-2', 'set status down', { target: 'managed-switch', wrap: 'edits' });
    expect(r.output).toBe(
      ['edit "port1"', '    set status down', 'next', 'edit "port2"', '    set status down', 'next'].join('\n'),
    );
  });

  it('treats ports as full outside managed switches', () => {
    const r = generateInterfaceRange('port1', 'set status down', { target: 'fortigate', wrap: 'ports' });
    expect(r.output.split('\n')[0]).toBe('config system interface');
  });
});

describe('bare numbers', () => {
  it('reads 1-24 as port1-port24', () => {
    const r = expandRange('1-4');
    expect(r.names).toEqual(['port1', 'port2', 'port3', 'port4']);
    expect(r.warnings).toEqual([
      { kind: 'fix', message: 'Bare numbers take the "port" prefix: 1-4 is port1-port4.' },
    ]);
  });

  it('works with single numbers, filters, exclusions, and named items', () => {
    expect(expandRange('1-8:odd, !5, 10, x1').names).toEqual(['port1', 'port3', 'port7', 'port10', 'x1']);
  });

  it('takes another prefix, or none', () => {
    expect(expandRange('1-2', { numberPrefix: 'x' }).names).toEqual(['x1', 'x2']);
    expect(expandRange('1-2', { numberPrefix: '' }).names).toEqual(['1', '2']);
  });

  it('leaves chassis-style names alone', () => {
    expect(expandRange('1-P1-1-P2').names).toEqual(['1-P1', '1-P2']);
  });

  it('reaches the generated config', () => {
    const { output } = generateInterfaceRange('1-2', 'set status down', { target: 'fortigate' });
    expect(output).toContain('edit "port1"');
    expect(output).toContain('edit "port2"');
  });
});
