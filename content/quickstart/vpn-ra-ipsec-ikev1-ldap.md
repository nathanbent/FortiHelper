---
category: vpn
description: Dial-up remote access IPsec on IKEv1 with XAuth against an LDAP group, including the address objects the tunnel needs.
order: 10
---

# Remote access IPsec — IKEv1 with LDAP

## How to use
1. Fill in the fields on the left
2. Create the LDAP server and user group first — this template references them by name but does not create them
3. Read the generated config, then paste it section by section

The client address pool and split-tunnel objects are created here, because
phase 1 refers to them by name and will not accept the config without them.

## Variables
- <tunnel-name> - Name for the tunnel and its objects - e.g. RA_IPsec-IKEv1
- <wan-interface> - Interface the tunnel listens on - e.g. wan1
- <pre-shared-key> - Pre-shared key for the gateway - e.g. ChangeMeToSomethingLong
- <vpn-user-group> - Existing user group XAuth authenticates against - e.g. VPN-Users
- <client-range-start> - First address handed to clients - e.g. 10.10.90.1
- <client-range-end> - Last address handed to clients - e.g. 10.10.90.254
- <split-subnet> - Internal subnet clients reach over the tunnel - e.g. 10.10.0.0
- <split-mask> - Mask for that subnet - e.g. 255.255.0.0
- <dns-server-1> - DNS server pushed to clients - e.g. 10.10.0.10
- <dns-server-2> - Second DNS server pushed to clients - e.g. 10.10.0.11
- <dns-domain> - DNS domain pushed to clients - e.g. corp.example.com
- <lan-interface> - Interface the clients need to reach - e.g. port1

```
# Client address pool and split-tunnel destination.
# Phase 1 references both by name, so they must exist first.
config firewall address
    edit "<tunnel-name>_range"
        set type iprange
        set start-ip <client-range-start>
        set end-ip <client-range-end>
        set comment "Client pool for <tunnel-name>"
    next
    edit "<tunnel-name>_split"
        set subnet <split-subnet> <split-mask>
        set comment "Split-tunnel destination for <tunnel-name>"
    next
end

# Phase 1 — dial-up, XAuth against an LDAP-backed user group
config vpn ipsec phase1-interface
    edit "<tunnel-name>"
        set type dynamic
        set interface "<wan-interface>"
        set peertype any
        set net-device disable
        set mode-cfg enable
        set ipv4-dns-server1 <dns-server-1>
        set ipv4-dns-server2 <dns-server-2>
        set proposal aes128-sha256 aes256-sha256 aes128-sha1 aes256-sha1
        set comments "Remote Access IPsec IKEv1, uses LDAP(S)"
        set dhgrp 20 21 14
        set xauthtype auto
        set authusrgrp "<vpn-user-group>"
        set assign-ip-from name
        set ipv4-split-include "<tunnel-name>_split"
        set ipv4-name "<tunnel-name>_range"
        set domain "<dns-domain>"
        set save-password enable
        set psksecret <pre-shared-key>
    next
end

# Phase 2
config vpn ipsec phase2-interface
    edit "<tunnel-name>"
        set phase1name "<tunnel-name>"
        set proposal aes128-sha1 aes256-sha1 aes128-sha256 aes256-sha256 aes128gcm aes256gcm chacha20poly1305
        set dhgrp 20 21 14
        set comments "VPN: <tunnel-name>"
    next
end

# Policy from the tunnel to the LAN. Without this the tunnel comes up and
# passes nothing.
config firewall policy
    edit 0
        set name "<tunnel-name>-to-LAN"
        set srcintf "<tunnel-name>"
        set dstintf "<lan-interface>"
        set srcaddr "<tunnel-name>_range"
        set dstaddr "<tunnel-name>_split"
        set action accept
        set schedule "always"
        set service "ALL"
        set groups "<vpn-user-group>"
        set logtraffic all
    next
end
```
