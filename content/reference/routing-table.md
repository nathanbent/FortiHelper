---
id: routing-table
title: Routing table and reachability
topic: routing
kind: diagnostics
order: 6
---

Draft, not verified on every release.

`get router info routing-table all` - Active routes: what the unit is forwarding with right now
`get router info routing-table database` - Every known route, including ones that lost to a better route
`get router info routing-table details <dest-ip>` - Which route matches one destination
> No matching route here, with a route present in the database, means a better route or a down interface is keeping it out of the table.
`get router info kernel` - The forwarding table as the kernel sees it
`diagnose firewall proute list` - Policy routes and SD-WAN rules, which are checked before the routing table
`diagnose ip address list` - Every IP address on the unit and the interface that holds it
`get system arp` - ARP table: is the next hop answering on layer 2?
`execute ping-options source <source-ip>` - Send the next pings from this address (must be one of the unit's own)
`execute ping <dest-ip>` - Ping from the FortiGate
`execute traceroute <dest-ip>` - Trace the path from the FortiGate
