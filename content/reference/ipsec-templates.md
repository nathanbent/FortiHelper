---
id: ipsec-templates
title: IPsec — route-based site-to-site
topic: ipsec
kind: config
order: 35
---

A starting template, not a verified known-good config. Replace every <placeholder>, and check the proposals against what the far end actually offers.

### IKEv2 phase 1 + phase 2 (route-based)

```
config vpn ipsec phase1-interface
    edit "<tunnel-name>"
        set interface "<wan-interface>"
        set ike-version 2
        set peertype any
        set net-device disable
        set proposal aes256-sha256
        set dhgrp 14
        set remote-gw <peer-public-ip>
        set psksecret <pre-shared-key>
    next
end

config vpn ipsec phase2-interface
    edit "<tunnel-name>-p2"
        set phase1name "<tunnel-name>"
        set proposal aes256-sha256
        set dhgrp 14
        set auto-negotiate enable
        set src-subnet <local-subnet> <local-mask>
        set dst-subnet <remote-subnet> <remote-mask>
    next
end
```

### Routing and policies for the tunnel

```
config router static
    edit 0
        set dst <remote-subnet> <remote-mask>
        set device "<tunnel-name>"
    next
end

config firewall policy
    edit 0
        set name "<tunnel-name>-out"
        set srcintf "<lan-interface>"
        set dstintf "<tunnel-name>"
        set srcaddr "<local-address-object>"
        set dstaddr "<remote-address-object>"
        set action accept
        set schedule "always"
        set service "ALL"
    next
    edit 0
        set name "<tunnel-name>-in"
        set srcintf "<tunnel-name>"
        set dstintf "<lan-interface>"
        set srcaddr "<remote-address-object>"
        set dstaddr "<local-address-object>"
        set action accept
        set schedule "always"
        set service "ALL"
    next
end
```
