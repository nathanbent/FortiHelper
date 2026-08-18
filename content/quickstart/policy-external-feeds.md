---
category: policy
description: Public threat-intelligence feeds as external resources, with deny policies both ways against each one.
order: 30
---

# Block policies — external threat feeds

## How to use
1. Set where the policies should sit in the table
2. Read the generated config before running it
3. Paste it in one go; the feed objects are created before the policies that use them

The FortiGate fetches each list on the refresh interval shown, so it needs
outbound HTTPS to those hosts. A feed that cannot be fetched leaves its policy
matching nothing rather than failing closed.

Feeds: Emerging Threats (blocks, individual IPs, compromised), Alienvault
reputation, Blocklist.de, a community ASN list, and Team Cymru bogons. Review
what each one contains before trusting it in a deny path — these are
third-party lists that change without notice.

Policy IDs 441–446 follow the convention that global blocks live in the 400
range.

## Variables
- <insert-before-policy-id> - Existing policy ID these should sit above, so the blocks are evaluated first - e.g. 1

```
# Threat-feed objects, refreshed on a timer
config system external-resource
    edit "Bad IP Blocks - EmergingThreats.net"
        set type address
        set comments "Bad IP Blocks from rules.emergingthreats.net"
        set resource "https://rules.emergingthreats.net/fwrules/emerging-Block-IPs.txt"
        set refresh-rate 30
    next
    edit "Bad IPs - EmergingThreats.net"
        set type address
        set comments "Individual bad IPs from emergingthreats.net"
        set resource "https://rules.emergingthreats.net/blockrules/compromised-ips.txt"
        set refresh-rate 30
    next
    edit "Reputation - Alienvault"
        set type address
        set resource "http://reputation.alienvault.com/reputation.data"
        set refresh-rate 30
    next
    edit "Bad IPs & IP Blocks - Blocklist.de"
        set type address
        set comments "Bad IPs & IP Blocks - Blocklist.de"
        set resource "https://lists.blocklist.de/lists/all.txt"
        set refresh-rate 30
    next
    edit "Bad ASNs - Reddit wallacebrf"
        set type address
        set resource "https://raw.githubusercontent.com/wallacebrf/dns/main/asn_block1.1.txt"
        set refresh-rate 30
    next
    edit "Bogon IPv4 - Team Cymru"
        set type address
        set resource "https://www.teamcymru.org/Services/Bogons/fullbogons-ipv4.txt"
        set refresh-rate 60
    next
    edit "Compromised IPs-EmergingThreats"
        set type address
        set resource "https://rules.emergingthreats.net/blockrules/compromised-ips.txt"
        set refresh-rate 60
    next
end

# Policies using those feeds
config firewall policy
    edit 441
        set name "WAN to Any - Block Emerging Threats"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "Bad IP Blocks - EmergingThreats.net" "Bad IPs - EmergingThreats.net" "Compromised IPs-EmergingThreats"
        set dstaddr "all"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 441 before <insert-before-policy-id>
    edit 442
        set name "Any to WAN - Block EmergingThreats"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set dstaddr "Bad IP Blocks - EmergingThreats.net" "Bad IPs - EmergingThreats.net" "Compromised IPs-EmergingThreats"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 442 before <insert-before-policy-id>
    edit 443
        set name "WAN to Any - Blocklist.de"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "Bad IPs & IP Blocks - Blocklist.de"
        set dstaddr "all"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 443 before <insert-before-policy-id>
    edit 444
        set name "Any to WAN - Blocklist.de"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set dstaddr "Bad IPs & IP Blocks - Blocklist.de"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 444 before <insert-before-policy-id>
    edit 445
        set name "WAN to Any - Alienvault"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "Reputation - Alienvault"
        set dstaddr "all"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 445 before <insert-before-policy-id>
    edit 446
        set name "Any to WAN - Alienvault"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set dstaddr "Reputation - Alienvault"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 446 before <insert-before-policy-id>
end
```
