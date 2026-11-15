---
id: fortiap-clients
title: Wireless clients
topic: fortiap
kind: diagnostics
order: 11
runOn: fortigate
---

Draft, not verified on every release. On a FortiGate with VDOMs, run these from the global context.

`diagnose wireless-controller wlac -d sta online` - Clients connected right now: MAC, address, AP, and SSID
`diagnose wireless-controller wlac -d sta` - Every client the controller is tracking, connected or not
`get wireless-controller status` - How many AP sessions and wireless clients there are
`diagnose debug application fnbamd -1` - Debug the authentication daemon, for the RADIUS side of a WPA-Enterprise SSID
