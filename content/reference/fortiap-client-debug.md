---
id: fortiap-client-debug
title: Wireless client: connection debug
topic: fortiap
kind: diagnostics
copyAll: true
order: 12
runOn: fortigate
---

Draft, not verified on every release. Follows one client through association, authentication, and the key handshake. On a FortiGate with VDOMs, run it from the global context. Run Stop debugging when finished.

`diagnose wireless-controller wlac sta_filter clear` - Clear any client filter left over from a previous session
`diagnose wireless-controller wlac sta_filter <client-mac> 255` - Debug this one client at full detail (use 2 for a summary of the handshake only)
`diagnose debug console timestamp enable` - Enable timestamps on debug output
`diagnose debug enable` - Start printing debug output
> Have the client connect now. A healthy join shows association, then authentication, then all four messages of the 4-way handshake. A handshake that stops after message 1 or 2 usually means a wrong passphrase.
