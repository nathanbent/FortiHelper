---
id: fortiap-rf
title: Rogue APs and channel selection
topic: fortiap
kind: diagnostics
order: 16
runOn: fortigate
---

Draft, not verified on every release. On a FortiGate with VDOMs, run these from the global context. Rogue scanning has to be enabled in the FortiAP profile before the rogue lists fill.

`diagnose wireless-controller wlac -c ap-rogue` - Other APs your APs can hear, with channel and signal
`diagnose wireless-controller wlac -c sta-rogue` - Clients seen associated to those other APs
`diagnose wireless-controller wlac -c darrp` - Automatic channel selection (DARRP): each radio's channel choices and the channel it is on
