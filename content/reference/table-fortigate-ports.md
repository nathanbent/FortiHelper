---
id: table-fortigate-ports
title: Ports a FortiGate uses
topic: general
kind: table
order: 85
---

Draft, not verified on every release. The common defaults, for upstream firewalls and for working out what is listening. Most can be changed.

```table
TCP 443 - Admin GUI (HTTPS). Also the usual choice for SSL VPN, which then has to move to another port such as 10443
TCP 22 - Admin CLI (SSH)
TCP 541 - FortiManager management tunnel
TCP 514 - Logs to FortiAnalyzer
UDP 514 - Logs to a syslog server
TCP 443, UDP 53, UDP 8888 - FortiGuard: updates and web filter ratings
TCP 8013 - Security Fabric and FortiClient EMS
UDP 5246 and 5247 - CAPWAP: FortiAP and FortiSwitch management
UDP 500 and 4500 - IPsec VPN
UDP 1812 and 1813 - RADIUS authentication and accounting
TCP 389 and 636 - LDAP and LDAPS
TCP 8000 - FSSO collector agent
TCP 1000 and 1003 - Firewall authentication portal, HTTP and HTTPS
UDP 161 and 162 - SNMP queries and traps
UDP 123 - NTP
EtherType 0x8890 - HA heartbeat between cluster members
```
