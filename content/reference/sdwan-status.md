---
id: sdwan-status
title: SD-WAN status
topic: routing
kind: diagnostics
order: 9
---

Draft, not verified on every release. FortiOS 6.2 and earlier use virtual-wan-link in place of sdwan. In diagnose sys session list, a session steered by an SD-WAN rule shows that rule's id as sdwan_service_id.

`diagnose sys sdwan health-check` - Each health check per member: alive or dead, loss, latency, jitter
`diagnose sys sdwan member` - Members with their gateway, priority, and weight
`diagnose sys sdwan service4` - IPv4 rules and which member each is choosing right now (FortiOS 7.4.4 and later)
`diagnose sys sdwan service` - The same on FortiOS before 7.4.4
`diagnose sys sdwan sla-log <health-check-name> <member-seq>` - Recent SLA history for one member of a health check
`diagnose sys sdwan intf-sla-log <interface>` - Recent bandwidth history for one member interface
`diagnose firewall proute list` - SD-WAN rules as installed policy routes, in match order
`get router info routing-table all` - SD-WAN only steers among members that have a valid route to the destination
