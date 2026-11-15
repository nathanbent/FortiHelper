---
id: fortilink-debug
title: FortiLink: debug sequence
topic: fortiswitch
kind: diagnostics
copyAll: true
order: 59.5
runOn: fortigate
---

Draft, not verified on every release. Shows the FortiGate discovering, authorising, and pushing config to its switches. Noisy on a large deployment: reproduce the problem quickly, then run Stop debugging.

`diagnose debug reset` - Start from a clean slate
`diagnose debug application fortilinkd -1` - Debug the FortiLink daemon: discovery and keepalives
`diagnose debug application cu_acd -1` - Debug the switch controller daemon: switches joining and authorising
`diagnose debug application flcfgd -1` - Debug the config daemon: what is pushed to each switch
`diagnose debug console timestamp enable` - Enable timestamps on debug output
`diagnose debug enable` - Start printing debug output
> For a config change that never reaches a switch, make the change now and watch flcfgd: it prints each setting it sends and any error the switch returns.
