---
id: webfilter-show
title: Web filter — what is configured
topic: webfilter
kind: diagnostics
order: 65
---

Confirm the tables exist and that a profile actually references them.

`show webfilter urlfilter` - URL filter lists and their entries
`show webfilter content` - Content (banned word) tables and their patterns
`show webfilter profile` - Profiles, including urlfilter-table and bword-table bindings
`show firewall policy` - Which policies apply a webfilter-profile, and with what SSL inspection
