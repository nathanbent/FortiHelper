---
id: traffic-debug-flow
title: Packet flow: why traffic is dropped
topic: traffic
kind: diagnostics
copyAll: true
order: 1
---

Traces a packet through the firewall and prints the decision at each step. Draft, not verified on every release. Remove any filter line you do not need before pasting: filters are ANDed together. Run Stop debugging when finished.

`diagnose debug reset` - Start from a clean slate
`diagnose debug flow filter clear` - Clear any flow filter left over from a previous session
`diagnose debug flow filter addr <host-ip>` - Match packets to or from this address
`diagnose debug flow filter port <dest-port>` - Match this port, source or destination (optional)
`diagnose debug flow filter proto <protocol-number>` - Match one IP protocol: 1 ICMP, 6 TCP, 17 UDP (optional)
`diagnose debug flow show function-name enable` - Show which kernel function made each decision
`diagnose debug flow show iprope enable` - Show the policy tables checked, not just the result
`diagnose debug console timestamp enable` - Enable timestamps on debug output
`diagnose debug flow trace start 100` - Trace the next 100 matching packets, then stop
> Reproduce the problem after the next command: only the first 100 matching packets are traced.
`diagnose debug enable` - Start printing debug output
> "Allowed by Policy-N" names the matching policy. "Denied by forward policy check (policy 0)" is the implicit deny. "reverse path check fail, drop" means the route back to the source points out a different interface. "iprope_in_check() check failed" means traffic to the FortiGate itself was refused: local-in policy, no VIP, or admin access off. No output at all means the packets are not reaching the unit, or the filter is wrong.
