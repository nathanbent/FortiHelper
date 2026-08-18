---
category: policy
description: Deny policies both ways against a group of untrusted countries, creating the GeoIP objects and the group they use.
order: 10
---

# Block policies — GeoIP

## How to use
1. Set where the policies should sit in the table, then fill in the rest
2. Read the generated config before running it — these are deny policies on "any" interface
3. Paste it in one go; the objects are created before the policies that use them

Policies use `srcintf "any"` / `dstintf "any"`, which needs multiple-interface
policies enabled (`config system settings` → `set gui-multiple-interface-policy enable`).
Countries blocked: China, Russia, Iran, Ukraine, Netherlands, Latvia, Greece,
North Korea, India, Pakistan, Bangladesh, Afghanistan.

Policy IDs 400 and 401 follow the convention that global blocks live in the
400 range.

## Variables
- <insert-before-policy-id> - Existing policy ID these should sit above, so the blocks are evaluated first - e.g. 1
- <untrusted-geoip-group> - Name for the group of untrusted countries - e.g. Untrusted Geo-IP Regions

```
# GeoIP address objects
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

# Group them so the policies reference one object
config firewall addrgrp
    edit "<untrusted-geoip-group>"
        set member "GeoIP - China" "GeoIP - Russia" "GeoIP - Iran" "GeoIP - Ukraine" "GeoIP - Netherlands" "GeoIP - Latvia" "GeoIP - Greece" "GeoIP - N. Korea" "GeoIP - India" "GeoIP - Pakistan" "GeoIP - Bangladesh" "GeoIP - Afghanistan"
        set color 6
    next
end

# Block malicious GeoIP traffic
config firewall policy
    edit 400
        set name "Block FROM Risky Countries"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "<untrusted-geoip-group>"
        set dstaddr "all"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
        set global-label "Global Blocks"
    next
    move 400 before <insert-before-policy-id>
    edit 401
        set name "Block TO Risky Countries"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set dstaddr "<untrusted-geoip-group>"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
        set global-label "Global Blocks"
    next
    move 401 before <insert-before-policy-id>
end
```
