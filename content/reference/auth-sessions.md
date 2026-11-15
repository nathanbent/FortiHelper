---
id: auth-sessions
title: Authenticated users and FSSO
topic: auth
kind: diagnostics
order: 11
---

Draft, not verified on every release. Who the firewall currently believes is behind each address, and whether the FSSO collector is feeding it.

`diagnose firewall auth list` - Every authenticated user: address, groups, method, and time left
`diagnose firewall auth clear` - Log everyone out. Every user has to authenticate again
`diagnose debug authd fsso server-status` - Is each FSSO collector agent connected?
`diagnose debug authd fsso list` - Logons learned from FSSO: user, address, and groups
> A user missing here was never reported by the collector. A user present with the wrong groups points at the group filter on the collector or the FortiGate.
`diagnose debug authd fsso refresh-logons` - Ask the collector to send its whole logon list again
`diagnose debug authd fsso refresh-groups` - Ask the collector to send its group list again
`diagnose debug application authd 8256` - Debug FSSO logon events as they arrive
`diagnose debug enable` - Start printing debug output
