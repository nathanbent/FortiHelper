---
id: ha-status
title: HA status and sync
topic: ha
kind: diagnostics
order: 55
---

Draft, not verified on every release. For FGCP clusters. All members should show the same checksums; when they differ, compare checksum show on each unit to find the VDOM and config section that is out of step.

`get system ha status` - Cluster health, which unit is primary and why, and sync state
> Configuration Status should read in-sync for every member.
`diagnose sys ha status` - Shorter view: members, priority, and uptime
`diagnose sys ha checksum cluster` - Config checksums for every member side by side
> Every member should show identical values on each line. A difference on "all" with matching "root" points at global config.
`diagnose sys ha checksum show` - This unit's checksums per config section
`diagnose sys ha checksum recalculate` - Recompute checksums; run on each member before trusting a mismatch
`execute ha synchronize start` - Ask this unit to resync its config from the primary
`diagnose sys ha history read` - Recent HA events: failovers, members joining and leaving
`diagnose debug application hasync -1` - Debug the config sync daemon
`diagnose debug application hatalk -1` - Debug the heartbeat daemon
`diagnose debug enable` - Start printing debug output
