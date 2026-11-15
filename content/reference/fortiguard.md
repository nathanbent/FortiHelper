---
id: fortiguard
title: FortiGuard updates and licensing
topic: general
kind: diagnostics
order: 71
---

Draft, not verified on every release.

`get system status` - Firmware, plus the version and date of each signature database
`diagnose autoupdate versions` - Every FortiGuard package: version, contract expiry, and last update attempt
`diagnose autoupdate status` - Whether scheduled and push updates are enabled
`diagnose debug rating` - Web filter and anti-spam rating servers, and whether they are answering
> An empty server list means the unit cannot reach FortiGuard for ratings: check DNS, then outbound access. A list with large packet-loss numbers explains slow browsing.
`execute ping service.fortiguard.net` - Can the unit resolve and reach the rating service?
`execute ping update.fortiguard.net` - And the update service?
`diagnose debug application update -1` - Debug the update daemon
`diagnose debug enable` - Start printing debug output
`execute update-now` - Fetch every update now. Watch the debug for the reason when it fails
`diagnose fdsm contract-controller-update` - Refresh the licence and contract information from FortiGuard
