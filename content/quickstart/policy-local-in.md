---
category: policy
description: Local-in policies restricting what may reach the firewall itself — BGP and IKE from untrusted countries.
order: 40
---

# Local-in policies

## How to use
1. Fill in the fields on the left
2. Read the generated config before running it
3. Paste it in one go

Local-in policies control traffic **to the FortiGate itself**, not traffic
through it. Get one wrong and you can lock yourself out of management — read
the generated config, and have console access before applying it.

The untrusted-country group is created here so the policy has something to
reference. If you have already run the GeoIP block template, keep the group
name the same and this re-creates it harmlessly rather than making a second one.

## Variables
- <wan-interface> - Interface these policies apply to - e.g. virtual-wan-link
- <untrusted-geoip-group> - Name for the group of untrusted countries - e.g. Untrusted Geo-IP Regions

```
# GeoIP address objects the policy references
config firewall address
    edit "GeoIP - China"
        set type geography
        set color 6
        set country "CN"
    next
    edit "GeoIP - Russia"
        set type geography
        set color 6
        set country "RU"
    next
    edit "GeoIP - Iran"
        set type geography
        set color 6
        set country "IR"
    next
    edit "GeoIP - Ukraine"
        set type geography
        set color 6
        set country "UA"
    next
    edit "GeoIP - Netherlands"
        set type geography
        set color 6
        set country "NL"
    next
    edit "GeoIP - Latvia"
        set type geography
        set color 6
        set country "LV"
    next
    edit "GeoIP - Greece"
        set type geography
        set color 6
        set country "GR"
    next
    edit "GeoIP - N. Korea"
        set type geography
        set color 6
        set country "KP"
    next
    edit "GeoIP - India"
        set type geography
        set color 6
        set country "IN"
    next
    edit "GeoIP - Pakistan"
        set type geography
        set color 6
        set country "PK"
    next
    edit "GeoIP - Bangladesh"
        set type geography
        set color 6
        set country "BD"
    next
    edit "GeoIP - Afghanistan"
        set type geography
        set color 6
        set country "AF"
    next
end

config firewall addrgrp
    edit "<untrusted-geoip-group>"
        set member "GeoIP - China" "GeoIP - Russia" "GeoIP - Iran" "GeoIP - Ukraine" "GeoIP - Netherlands" "GeoIP - Latvia" "GeoIP - Greece" "GeoIP - N. Korea" "GeoIP - India" "GeoIP - Pakistan" "GeoIP - Bangladesh" "GeoIP - Afghanistan"
        set color 6
    next
end

# Local-in policies — traffic terminating on the firewall
config firewall local-in-policy
    edit 101
        set intf "<wan-interface>"
        set srcaddr "all"
        set dstaddr "all"
        set service "BGP"
        set schedule "always"
    next
    edit 102
        set intf "<wan-interface>"
        set srcaddr "<untrusted-geoip-group>"
        set dstaddr "all"
        set service "IKE"
        set schedule "always"
    next
end
```
