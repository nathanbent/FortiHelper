---
id: conserve-mode
title: Memory, conserve mode, and crashes
topic: general
kind: diagnostics
order: 73
---

Draft, not verified on every release. In conserve mode the unit stops accepting some new sessions and skips inspection to protect itself. It enters at 88 percent memory use by default. Find what is using the memory before restarting anything: the evidence goes when the process does.

`diagnose hardware sysinfo conserve` - Is the unit in conserve mode, and at what thresholds?
`get system performance status` - CPU, memory, and session count at a glance
`diagnose sys top-mem` - Processes using the most memory
`diagnose sys top 1 99` - Live process list, refreshed every second (q to quit, m to sort by memory)
`diagnose sys session stat` - Session table size and how many sessions were dropped for lack of memory
`diagnose debug crashlog read` - Process crashes and conserve-mode entries, newest last
> Repeated crashes of the same process, or a conserve-mode entry naming one, tell you which daemon to look at. Save this output before a reboot clears your chance to read it.
`diagnose test application ipsmonitor 99` - Restart the IPS engine. Inspection pauses briefly
`diagnose test application wad 99` - Restart the proxy daemon. Proxied sessions drop
`diagnose sys kill 11 <process-id>` - Restart one process and record a crash log entry for it. A last resort
`execute tac report` - Collect everything support will ask for
