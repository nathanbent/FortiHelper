---
id: fortiswitch-on-switch
title: FortiSwitch: on the switch itself
topic: fortiswitch
kind: diagnostics
order: 64.95
runOn: fortiswitch
---

Draft, not verified on every release. Typed into the switch's own CLI, over its console port or SSH, for when FortiLink is down and the FortiGate cannot ask on your behalf. Command names vary a little between FortiSwitchOS releases.

`get system status` - Model, serial number, and FortiSwitchOS version
`diagnose switch physical-ports summary` - Every port: link state, speed, duplex, and native VLAN
`diagnose switch physical-ports cable-diag <port>` - Cable test (TDR) on one copper port. Drops the link for a few seconds
`diagnose switch mac-address list` - MAC table: which port each address was learned on
`diagnose switch trunk summary` - Trunks, including the automatic inter-switch and FortiLink ones
`diagnose stp instance list` - Spanning-tree state and port roles for each instance
`get switch lldp neighbors-summary` - What is plugged into each port, as reported by LLDP
`get switch poe inline` - PoE power per port and the remaining budget
`diagnose sys ntp status` - Time sync. A switch with the wrong time will not stay online
`execute factoryreset` - Return the switch to factory defaults, ready to be discovered again. It reboots
