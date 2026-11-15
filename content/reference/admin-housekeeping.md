---
id: admin-housekeeping
title: Admins, time, and reboot
topic: general
kind: diagnostics
order: 75
---

Draft, not verified on every release.

`get system info admin status` - Administrators logged in now, with the index number of each session
`execute disconnect-admin-session <admin-index>` - Log one administrator out
`execute time` - The unit's current time
`execute date` - The unit's current date
`diagnose sys ntp status` - Whether the clock is synchronised, and to which server
> Wrong time breaks certificates, SAML logins, two-factor codes, and the timestamps on every log.
`execute ping <dest-ip>` - Basic reachability from the unit
`execute reboot` - Restart the unit
`execute shutdown` - Power the unit down cleanly before unplugging it
