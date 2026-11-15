# Reference variables

Labels, examples and types for the `<placeholder>`s used across the sheets
in `content/reference/`. One bullet per placeholder, in this form:

`- <name> (type) - Label - e.g. example`

The `(type)` and the `e.g.` are optional. Types are ip, cidr, mask, port and
number: a value of the wrong shape gets a warning under its field, and is
still filled in. A sheet can override an entry with its own `## Variables`
list. Keep examples generic: private or documentation addresses only.

## Addresses

- <host-ip> (ip) - Host IP - e.g. 10.1.2.3
- <source-ip> (ip) - Source IP - e.g. 10.1.2.3
- <dest-ip> (ip) - Destination IP - e.g. 10.2.0.10
- <peer-ip> (ip) - Remote gateway IP - e.g. 203.0.113.10
- <neighbor-ip> (ip) - Neighbor IP - e.g. 10.255.0.2
- <fortigate-ip> (ip) - FortiGate IP - e.g. 10.1.1.1
- <fortilink-ip> (ip) - FortiLink interface IP - e.g. 10.255.1.1
- <fortilink-mask> (mask) - FortiLink netmask - e.g. 255.255.255.0
- <ap-ip> (ip) - FortiAP IP - e.g. 10.1.30.20
- <querier-ip> (ip) - IGMP querier IP - e.g. 10.1.20.1
- <subnet-cidr> (cidr) - Subnet - e.g. 10.1.2.0/24
- <local-subnet> (ip) - Local subnet - e.g. 10.1.0.0
- <local-mask> (mask) - Local netmask - e.g. 255.255.255.0
- <remote-subnet> (ip) - Remote subnet - e.g. 10.2.0.0
- <remote-mask> (mask) - Remote netmask - e.g. 255.255.255.0

## Ports and protocols

- <dest-port> (port) - Destination port - e.g. 443
- <source-port> (port) - Source port - e.g. 50000
- <protocol-number> (number) - IP protocol number - e.g. 6
- <protocol> - Protocol - e.g. tcp

## Interfaces

- <interface> - Interface - e.g. port1
- <source-interface> - Incoming interface - e.g. port2
- <wan-interface> - WAN interface - e.g. wan1
- <lan-interface> - LAN interface - e.g. internal
- <fortilink-interface> - FortiLink interface - e.g. fortilink
- <vlan-interface> - VLAN interface - e.g. vlan20
- <voice-vlan-interface> - Voice VLAN interface - e.g. vlan30
- <guest-vlan-interface> - Guest VLAN interface - e.g. vlan40
- <auth-fail-vlan-interface> - Auth-fail VLAN interface - e.g. vlan50

## FortiSwitch

- <switch-id> - Switch ID - e.g. S108EN5918000000
- <FortiSwitch_serial_number> - FortiSwitch serial - e.g. S108EN5918000000
- <port> - Switch port - e.g. port7
- <uplink-port> - Uplink port - e.g. port23
- <icl-port> - ICL port - e.g. port24
- <port-a> - First member port - e.g. port1
- <port-b> - Second member port - e.g. port2
- <trunk-name> - Trunk name - e.g. uplink-lag
- <instance> (number) - MST instance - e.g. 0
- <vlan-id> (number) - VLAN ID - e.g. 20

## FortiAP

- <ap-serial> - FortiAP serial - e.g. FP231FTF20000000
- <client-mac> - Client MAC address - e.g. 00:11:22:33:44:55

## VPN

- <tunnel-name> - Tunnel name - e.g. to-branch
- <phase1-name> - Phase 1 name - e.g. to-branch
- <pre-shared-key> - Pre-shared key

## SD-WAN and HA

- <health-check-name> - Health check name - e.g. Default_DNS
- <member-seq> (number) - Member sequence number - e.g. 1
- <member-index> (number) - Cluster member index - e.g. 1
- <cluster-id> (number) - Cluster ID - e.g. 1
- <admin-username> - Admin username - e.g. admin
