---
id: fortiswitch-ports
title: FortiSwitch: ports, MACs, and neighbours
topic: fortiswitch
kind: diagnostics
order: 60.5
runOn: fortigate
---

Draft, not verified on every release. For finding which port a device is on and why a port is misbehaving, without logging in to the switch. The switch-info subcommands on offer vary by FortiOS release: type diagnose switch-controller switch-info ? to see yours.

`diagnose switch-controller switch-info mac-table <FortiSwitch_serial_number>` - MAC table of one switch: which port each address was learned on
`diagnose switch-controller switch-info mac-table <FortiSwitch_serial_number> <vlan-id>` - The same, for one VLAN
`diagnose switch-controller mac-cache show <FortiSwitch_serial_number>` - Hosts the FortiGate has recorded behind a switch. Entries age out slowly, so this can list devices that have gone
`diagnose switch-controller switch-info port-stats <FortiSwitch_serial_number> <port>` - Packet and error counters for one port
> Error counters that keep rising (CRC, alignment, collisions) point at the cable, the transceiver, or a speed and duplex mismatch.
`diagnose switch-controller switch-info port-properties <FortiSwitch_serial_number> <port>` - What a port can do: PoE, connector type, speeds [7.0.1+]
`diagnose switch-controller switch-info lldp neighbors-summary <FortiSwitch_serial_number>` - What is plugged into each port, as reported by LLDP
`diagnose switch-controller switch-info modules summary <FortiSwitch_serial_number>` - Transceivers fitted in the switch
`diagnose switch-controller switch-info trunk status <FortiSwitch_serial_number>` - LAG and LACP state for every trunk
`diagnose switch-controller switch-info mclag list <FortiSwitch_serial_number>` - MCLAG trunks and the state of each side
`diagnose switch-controller switch-info mclag icl <FortiSwitch_serial_number>` - The inter-chassis link between an MCLAG pair
`diagnose switch-controller switch-info mclag peer-consistency-check <FortiSwitch_serial_number>` - Whether the two MCLAG peers agree on their config
