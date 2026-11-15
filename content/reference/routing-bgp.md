---
id: routing-bgp
title: BGP
topic: routing
kind: diagnostics
order: 7
---

Draft, not verified on every release. received-routes only works when soft-reconfiguration is enabled for that neighbor. Run Stop debugging after the debug commands.

`get router info bgp summary` - One line per neighbor: state, uptime, prefixes received
`get router info bgp neighbors` - Full detail for every neighbor, including the last error
`get router info bgp network` - The BGP table, with the best path for each prefix marked
`get router info bgp neighbors <neighbor-ip> advertised-routes` - What this unit is sending to a neighbor
`get router info bgp neighbors <neighbor-ip> received-routes` - What a neighbor sent, before inbound filtering
`get router info bgp neighbors <neighbor-ip> routes` - What was accepted from a neighbor, after filtering
`get router info routing-table bgp` - BGP routes that made it into the routing table
`execute router clear bgp ip <neighbor-ip> soft in` - Re-apply inbound policy without dropping the session
`execute router clear bgp ip <neighbor-ip> soft out` - Re-send routes to a neighbor without dropping the session
`diagnose ip router bgp all enable` - Turn on BGP debugging
`diagnose ip router bgp level info` - Set the BGP debug level
`diagnose debug enable` - Start printing debug output
