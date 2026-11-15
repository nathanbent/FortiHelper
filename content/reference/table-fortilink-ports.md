---
id: table-fortilink-ports
title: Ports and protocols: FortiLink and CAPWAP
topic: fortiswitch
kind: table
order: 64.97
---

Draft, not verified on every release. What has to pass between a FortiGate and the switches and APs it manages, for firewalls, ACLs, or a routed link in between.

```table
UDP 5246 - CAPWAP control. FortiAP to FortiGate, and FortiSwitch to FortiGate over FortiLink
UDP 5247 - CAPWAP data. Traffic of tunnel-mode SSIDs, FortiAP to FortiGate
TCP 443 - HTTPS. FortiGate to FortiSwitch, to push configuration
UDP 123 - NTP. Switches and APs take their time from the FortiGate
UDP 67 and 68 - DHCP. Switches and APs get their management address, and optionally the controller address (option 138)
UDP 53 - DNS. Only when APs find the controller by name
LLDP (EtherType 0x88CC) - FortiLink discovery and automatic inter-switch links. Link-local: never crosses a router
```
