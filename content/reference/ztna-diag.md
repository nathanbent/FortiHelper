---
id: ztna-diag
title: ZTNA and EMS
topic: remote
kind: diagnostics
order: 11
since: 7.0
---

Draft, not verified on every release. ZTNA decisions depend on what FortiClient EMS has told the FortiGate about each endpoint, so start by proving the EMS link and the tags before debugging a connection.

`diagnose endpoint fctems test-connectivity <ems-name>` - Can the FortiGate reach and log in to EMS?
`execute fctems verify <ems-name>` - Check and accept the EMS server certificate
`diagnose test application fcnacd 2` - EMS connection state as the FortiGate's EMS daemon sees it
`diagnose firewall dynamic list` - ZTNA tags from EMS and the addresses currently in each
`diagnose endpoint ec-shm list` - Endpoints the FortiGate knows: user, tags, and certificate [7.4.2+]
`diagnose endpoint record list <endpoint-ip>` - The same for one endpoint [<7.4.2]
> An endpoint with no tags cannot match a ZTNA rule that requires one. Check the tagging rules on EMS and that the endpoint is connected to it.
`diagnose wad debug enable category policy` - Debug how the proxy matches ZTNA rules
`diagnose wad debug enable level verbose` - At full detail
`diagnose debug enable` - Start printing debug output
