---
id: ha-failover
title: HA: manage members and fail over
topic: ha
kind: diagnostics
order: 56
---

Draft, not verified on every release. The failover commands interrupt traffic: use them in a maintenance window. The failover flag stays set until you unset it, and while set it overrides normal primary election.

`execute ha manage ?` - List the other cluster members and their index numbers
`execute ha manage <member-index> <admin-username>` - Open a CLI session on another member through the heartbeat link
`diagnose sys ha reset-uptime` - Run on the primary to hand the role to the other unit. Only has an effect with override disabled
`execute ha failover set <cluster-id>` - Force this unit to step down, for testing
`execute ha failover status` - Show whether the failover flag is set
`execute ha failover unset <cluster-id>` - Clear the failover flag afterwards
