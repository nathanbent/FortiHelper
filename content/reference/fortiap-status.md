---
id: fortiap-status
title: FortiAP status
topic: fortiap
kind: diagnostics
order: 10
runOn: fortigate
---

Draft, not verified on every release. On a FortiGate with VDOMs, run the diagnose commands from the global context.

`get wireless-controller wtp-status` - Every AP the controller knows, with its address and name
`get wireless-controller status` - How many AP sessions and wireless clients there are
`diagnose wireless-controller wlac -c wtp` - Full detail for every AP: connection state, firmware, radios, and channels
`diagnose wireless-controller wlac -c wtp <ap-serial>` - The same for one AP
> The connection state should be connected. The join and last-failure fields say when the AP last dropped and why.
`diagnose wireless-controller wlac -d wtp` - The APs as the data plane sees them
`execute wireless-controller reset-wtp <ap-serial>` - Reboot one AP. Every client on it is disconnected
