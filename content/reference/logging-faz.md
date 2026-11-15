---
id: logging-faz
title: Logging and FortiAnalyzer
topic: general
kind: diagnostics
order: 72
---

Draft, not verified on every release.

`execute log fortianalyzer test-connectivity` - Can the unit reach FortiAnalyzer, and is it registered there?
> Registration and connection should both read as good. Error -19 means the FortiGate is not authorised yet: approve it on the FortiAnalyzer.
`get log fortianalyzer setting` - The FortiAnalyzer the unit is configured to use
`diagnose test application fgtlogd 4` - Log queue and delivery statistics for FortiAnalyzer [7.4+]
`diagnose test application miglogd 6` - The same on older releases [<7.4]
`diagnose log test` - Generate one test log of every type
`execute log filter category 0` - Point the log display at traffic logs
`execute log display` - Show the most recent logs matching the filter
`diagnose sys logdisk usage` - How full the local log disk is
`diagnose sniffer packet any 'port 514' 4 0 l` - Are logs leaving for FortiAnalyzer or a syslog server?
