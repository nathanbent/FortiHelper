---
id: routing-ospf
title: OSPF
topic: routing
kind: diagnostics
order: 8
---

Draft, not verified on every release. Neighbors stuck in ExStart or Exchange usually mean an MTU mismatch; no neighbor at all usually means mismatched area, timers, network type, or authentication. Run Stop debugging after the debug commands.

`get router info ospf status` - Router id, areas, and SPF run counts
`get router info ospf neighbor` - Neighbor state: Full is the goal
`get router info ospf interface` - Per-interface area, timers, network type, and DR / BDR
`get router info ospf database brief` - Link-state database summary
`get router info routing-table ospf` - OSPF routes that made it into the routing table
`diagnose ip router ospf all enable` - Turn on OSPF debugging
`diagnose ip router ospf level info` - Set the OSPF debug level
`diagnose debug enable` - Start printing debug output
`execute router clear ospf process` - Restart OSPF. Drops every adjacency: use with care
