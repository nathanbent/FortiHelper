---
id: table-poe
title: PoE standards and power
topic: fortiswitch
kind: table
order: 64.99
---

The first figure is what the switch port supplies; the second is what is guaranteed to reach the device after cable loss. Check an AP's data sheet for what it needs to run every radio at full power, and add up the switch's total PoE budget, not just the per-port limit.

```table
802.3af (PoE, Type 1) - 15.4 W at the port, 12.95 W at the device
802.3at (PoE+, Type 2) - 30 W at the port, 25.5 W at the device
802.3bt Type 3 (PoE++) - 60 W at the port, 51 W at the device
802.3bt Type 4 (PoE++) - 90 W at the port, 71.3 W at the device
```
