---
id: table-sniffer
title: Sniffer verbosity levels
topic: traffic
kind: table
order: 2.5
---

The number after the filter in diagnose sniffer packet. Level 4 is the everyday choice; level 6 is the one to capture for conversion to a pcap.

```table
1 - Packet headers only
2 - Headers, plus the IP payload in hex
3 - Headers, plus the whole frame from the Ethernet header in hex
4 - Headers, with the interface each packet was seen on
5 - Level 2, with the interface name
6 - Level 3, with the interface name
```
