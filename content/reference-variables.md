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
- <client-public-ip> (ip) - Client public IP - e.g. 198.51.100.25
- <endpoint-ip> (ip) - Endpoint IP - e.g. 10.1.2.3
- <tftp-ip> (ip) - TFTP server IP - e.g. 10.1.1.50
- <vlan-ip> (ip) - VLAN interface IP - e.g. 10.1.20.1
- <vlan-mask> (mask) - VLAN netmask - e.g. 255.255.255.0
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
- <switch-name> - Switch name - e.g. IDF2-SW01
- <switch-description> - Switch description - e.g. Second floor, rack B
- <port> - Switch port - e.g. port7
- <uplink-port> - Uplink port - e.g. port23
- <icl-port> - ICL port - e.g. port24
- <port-a> - First member port - e.g. port1
- <port-b> - Second member port - e.g. port2
- <trunk-name> - Trunk name - e.g. uplink-lag
- <instance> (number) - MST instance - e.g. 0
- <vlan-id> (number) - VLAN ID - e.g. 20
- <image-file> - Firmware image filename - e.g. FSW_124F-v7-build0500-FORTINET.out
- <image-id> - Image ID from list-available - e.g. S124FF-IMG.swtp
- <mac-policy-name> - MAC policy name - e.g. printers-vlan
- <mac-pattern> - MAC address or pattern - e.g. 00:11:22:*:*:*

## FortiAP

- <ap-serial> - FortiAP serial - e.g. FP231FTF20000000
- <client-mac> - Client MAC address - e.g. 00:11:22:33:44:55
- <switch-group-name> - Switch group name - e.g. IDF2
- <switch-profile-name> - Switch profile name - e.g. default
- <access-profile-name> - Access profile name - e.g. default
- <ap-name> - AP name - e.g. Floor2-East
- <ap-location> - AP location - e.g. Second floor, east corridor
- <ap-model> - FortiAP model - e.g. 231F
- <ap-profile-name> - FortiAP profile name - e.g. office-231F
- <ap-group-name> - AP group name - e.g. floor-2
- <ssid-interface> - SSID interface name - e.g. corp-wifi
- <ssid-name> - SSID as broadcast - e.g. Corp
- <wifi-passphrase> - Wi-Fi passphrase
- <radius-server-name> - RADIUS server object - e.g. nps-01

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

## Authentication and system

- <server-name> - Server object name on the FortiGate - e.g. dc01-ldap
- <username> - Username to test - e.g. jsmith
- <password> - Password to test
- <ems-name> - EMS connector name - e.g. ems-01
- <tunnel-index> (number) - Session index from the list - e.g. 0
- <admin-index> (number) - Admin session index from the list - e.g. 1
- <process-id> (number) - Process ID - e.g. 1234
- <config-file> - Backup filename - e.g. fgt-backup.conf
