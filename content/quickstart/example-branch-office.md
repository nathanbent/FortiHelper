---
category: site
description: A minimal, generic branch build — interfaces, route, DNS, NTP, one outbound policy, and a parameterised management source.
order: 90
---
# Example — branch office basics

## How to use
1. Fill in the fields on the left
2. Read the generated config before running any of it
3. Copy it into the FortiGate, section by section

This is a deliberately small, generic example — it exists to show the template
format, not to be a build standard. Keep your real templates out of this repo:
drop them in `content/quickstart/private/`, or paste one into the page under
**Use a different template**.

Addresses below use the RFC 5737 documentation ranges (`198.51.100.0/24`,
`203.0.113.0/24`) so no example can collide with a real network. Anything that
identifies a site or a management network is a variable, never a literal.

## Variables
- <site-short-name> - Short site name, used in object and hostnames - e.g. BR1
- <WAN-port-name> - WAN interface - e.g. wan1
- <WAN-IP> - WAN address (just the IP, no CIDR) - e.g. 198.51.100.10
- <WAN-IP-subnet> - WAN subnet mask - e.g. 255.255.255.248
- <WAN-gateway-IP> - WAN gateway - e.g. 198.51.100.9
- <LAN-port-name> - LAN interface - e.g. port1
- <LAN-IP> - LAN address (just the IP, no CIDR) - e.g. 10.10.10.1
- <LAN-IP-subnet> - LAN subnet mask - e.g. 255.255.255.0
- <DNS-primary-IP> - Primary DNS server - e.g. 9.9.9.9
- <DNS-secondary-IP> - Secondary DNS server - e.g. 149.112.112.112
- <NTP-server> - NTP server - e.g. pool.ntp.org
- <trusted-mgmt-object> - Name of the trusted remote-management source object - e.g. MSP WAN - Fiber-203.0.113.0/27
- <trusted-mgmt-subnet> - Trusted remote-management source subnet (just the IP, no CIDR) - e.g. 203.0.113.0
- <trusted-mgmt-mask> - Trusted remote-management subnet mask - e.g. 255.255.255.224

```
# Hostname
config system global
    set hostname "<site-short-name>-FGT"
end

# WAN interface
config system interface
    edit "<WAN-port-name>"
        set alias "WAN"
        set mode static
        set ip <WAN-IP> <WAN-IP-subnet>
        set allowaccess ping
        set role wan
    next
end

# LAN interface
config system interface
    edit "<LAN-port-name>"
        set alias "LAN"
        set mode static
        set ip <LAN-IP> <LAN-IP-subnet>
        set allowaccess ping https ssh
        set role lan
    next
end

# Default route
config router static
    edit 1
        set dst 0.0.0.0 0.0.0.0
        set device "<WAN-port-name>"
        set gateway <WAN-gateway-IP>
        set comment "WAN default gateway"
    next
end

# DNS
config system dns
    set primary <DNS-primary-IP>
    set secondary <DNS-secondary-IP>
end

# NTP
config system ntp
    set type custom
    set ntpsync enable
    config ntpserver
        edit 1
            set server "<NTP-server>"
        next
    end
end

# LAN address object and outbound policy
config firewall address
    edit "<site-short-name>-LAN"
        set subnet <LAN-IP> <LAN-IP-subnet>
    next
end

config firewall policy
    edit 1
        set name "<site-short-name>-LAN-to-WAN"
        set srcintf "<LAN-port-name>"
        set dstintf "<WAN-port-name>"
        set srcaddr "<site-short-name>-LAN"
        set dstaddr "all"
        set action accept
        set schedule "always"
        set service "ALL"
        set nat enable
    next
end

# Trusted remote-management source
# Keep the network you manage from in a variable, not a literal — a template
# that names it is a template you cannot share.
config firewall address
    edit "<trusted-mgmt-object>"
        set subnet <trusted-mgmt-subnet> <trusted-mgmt-mask>
        set color 17
    next
end

config firewall addrgrp
    edit "Trusted Remote Access Group"
        set member "<trusted-mgmt-object>"
        set color 3
    next
end

# Restrict admin access to that group. Pair this with MFA — a source
# allowlist is a filter, not an authentication control.
config system admin
    edit "admin"
        set trusthost1 <trusted-mgmt-subnet> <trusted-mgmt-mask>
    next
end
```
