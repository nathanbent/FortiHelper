---
id: table-admin-distance
title: Administrative distances
topic: routing
kind: table
order: 9.5
---

FortiOS defaults. When two routes to the same prefix come from different sources, the lower distance wins and the other stays in the routing database only. Each can be changed per route or per protocol.

```table
0 - Connected
5 - Default route learned from DHCP or PPPoE
10 - Static
20 - BGP learned from another AS (eBGP)
110 - OSPF
115 - IS-IS
120 - RIP
200 - BGP learned inside the AS (iBGP)
```
