---
id: ipsec-status
title: IPsec tunnel status
topic: ipsec
kind: diagnostics
order: 10
---

Start here: what the tunnel thinks its state is, before turning on any debug.

`get vpn ipsec tunnel summary` - One line per tunnel — up/down and selector counts
`diagnose vpn ike gateway list` - Phase 1 gateways: state, peer, proposals, established time
`diagnose vpn tunnel list` - Phase 2 SAs with encrypt/decrypt packet counters
`diagnose vpn ipsec status` - Crypto engine status and per-engine SA counts
`get router info routing-table all` - Confirm traffic is actually routed into the tunnel interface
