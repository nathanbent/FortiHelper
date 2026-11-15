---
id: fortiswitch-actions
title: FortiSwitch: restart, cable test, and reset
topic: fortiswitch
kind: diagnostics
order: 60.7
runOn: fortigate
---

Draft, not verified on every release. These change things: every one interrupts traffic on the port or the switch it is aimed at.

`execute switch-controller switch-action cable-diag <FortiSwitch_serial_number> <port>` - Cable test (TDR) on one copper port. Drops the link on that port for a few seconds
> Each pair reports Ok, Open, or Short with a rough length. Open at 0 metres means nothing is plugged in. Lengths are approximate.
`execute switch-controller restart-swtp <FortiSwitch_serial_number>` - Reboot one switch
`execute switch-controller restart-swtp-delayed ALL` - Reboot every managed switch after a two-minute delay
`execute switch-controller factory-reset <switch-id>` - Return a switch to factory defaults. It reboots and has to be discovered again
`execute switch-controller set-standalone <switch-id>` - Take a switch out of FortiLink management: factory defaults, reboot, standalone mode
