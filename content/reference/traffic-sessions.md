---
id: traffic-sessions
title: Sessions and policy lookup
topic: traffic
kind: diagnostics
order: 3
---

Draft, not verified on every release. Set a session filter before listing or clearing: with no filter set, session clear removes every session on the unit and drops all traffic in flight.

`get system session status` - How many sessions are in the table
`diagnose sys session filter clear` - Clear any session filter left over from a previous session
`diagnose sys session filter src <source-ip>` - Match sessions from this source
`diagnose sys session filter dst <dest-ip>` - Match sessions to this destination
`diagnose sys session filter dport <dest-port>` - Match sessions to this destination port
`diagnose sys session filter` - Show the filter currently in effect
`diagnose sys session list` - Sessions matching the filter, with policy id, NAT, and offload state
> policy_id is the policy that allowed the session. A line beginning npu info means it is offloaded, so the sniffer will not show its packets.
`diagnose sys session clear` - Delete the sessions matching the filter. Check the filter first
`diagnose firewall iprope lookup <source-ip> <source-port> <dest-ip> <dest-port> <protocol> <source-interface>` - Which policy this traffic would match; protocol is tcp, udp, or a number. Unreliable for policies that require authentication
