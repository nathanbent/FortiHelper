---
category: policy
description: Deny policies against known scanners, Tor, botnets, proxies, phishing and spam sources using the Internet Service Database.
order: 20
---

# Block policies — Internet Service DB

## How to use
1. Set where the policies should sit in the table
2. Read the generated config before running it
3. Paste it in one go

**ISDB entries need an active FortiGuard subscription.** Without one these
policies error out on the `internet-service-*-name` lines rather than failing
quietly, so run this where you can watch the output.

Policies use `srcintf "any"` / `dstintf "any"`, which needs multiple-interface
policies enabled. IDs 411–427 follow the convention that global blocks live in
the 400 range.

Covers scanners (Shodan, Censys, Rapid7, Shadowserver and others), known
malicious servers, Tor nodes, anonymous VPNs, botnet C2, THE Hosting,
phishing, proxies, and spam sources — each blocked in both directions.

## Variables
- <insert-before-policy-id> - Existing policy ID these should sit above, so the blocks are evaluated first - e.g. 1

```
# Block malicious internet services
config firewall policy
    edit 411
        set name "Block FROM Scanners"
        set srcintf "any"
        set dstintf "any"
        set dstaddr "all"
        set internet-service-src enable
        set internet-service-src-name "Shodan-Scanner" "Censys-Scanner" "Stretchoid-Scanner" "InterneTTL-Scanner" "Tenable-Tenable.io.Cloud.Scanner" "NetScout-Scanner" "Recyber-Scanner" "Cyber.Casa-Scanner" "BinaryEdge-Scanner" "Rapid7-Scanner" "UK.NCSC-Scanner" "CriminalIP-Scanner" "Internet.Census.Group-Scanner" "Shadowserver-Scanner" "LeakIX-Scanner" "Hadrian-Scanner" "ONYPHE-Scanner" "Modat-Scanner" "Palo.Alto.Networks-Cortex.Xpanse.Scanner"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
        set global-label "Global Blocks"
    next
    move 411 before <insert-before-policy-id>
    edit 412
        set name "Block FROM Malicious Servers"
        set srcintf "any"
        set dstintf "any"
        set dstaddr "all"
        set internet-service-src enable
        set internet-service-src-name "Malicious-Malicious.Server"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 412 before <insert-before-policy-id>
    edit 413
        set name "Block TO Malicious Servers"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set internet-service enable
        set internet-service-name "Malicious-Malicious.Server"
        set schedule "always"
        set logtraffic all
        set action deny
    next
    move 413 before <insert-before-policy-id>
    edit 414
        set name "Block FROM Tor"
        set srcintf "any"
        set dstintf "any"
        set dstaddr "all"
        set internet-service-src enable
        set internet-service-src-name "Tor-Relay.Node" "Tor-Exit.Node" "Tor-Tor.Node"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 414 before <insert-before-policy-id>
    edit 415
        set name "Block TO Tor"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set internet-service enable
        set internet-service-name "Tor-Relay.Node" "Tor-Exit.Node" "Tor-Tor.Node"
        set schedule "always"
        set logtraffic all
        set action deny
    next
    move 415 before <insert-before-policy-id>
    edit 416
        set name "Block FROM VPN"
        set srcintf "any"
        set dstintf "any"
        set dstaddr "all"
        set internet-service-src enable
        set internet-service-src-name "VPN-Anonymous.VPN"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 416 before <insert-before-policy-id>
    edit 417
        set name "Block TO VPN"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set internet-service enable
        set internet-service-name "VPN-Anonymous.VPN"
        set schedule "always"
        set logtraffic all
        set action deny
    next
    move 417 before <insert-before-policy-id>
    edit 418
        set name "Block FROM Botnet"
        set srcintf "any"
        set dstintf "any"
        set dstaddr "all"
        set internet-service-src enable
        set internet-service-src-name "Botnet-C&C.Server"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 418 before <insert-before-policy-id>
    edit 419
        set name "Block TO Botnet"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set internet-service enable
        set internet-service-name "Botnet-C&C.Server"
        set schedule "always"
        set logtraffic all
        set action deny
    next
    move 419 before <insert-before-policy-id>
    edit 420
        set name "Block FROM THE_Hosting"
        set srcintf "any"
        set dstintf "any"
        set dstaddr "all"
        set internet-service-src enable
        set internet-service-src-name "THE.Hosting-THE.Hosting.Hosting.Service"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 420 before <insert-before-policy-id>
    edit 421
        set name "Block TO THE_Hosting"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set internet-service enable
        set internet-service-name "THE.Hosting-THE.Hosting.Hosting.Service"
        set schedule "always"
        set logtraffic all
        set action deny
    next
    move 421 before <insert-before-policy-id>
    edit 422
        set name "Block FROM Phishing"
        set srcintf "any"
        set dstintf "any"
        set dstaddr "all"
        set internet-service-src enable
        set internet-service-src-name "Phishing-Phishing.Server"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 422 before <insert-before-policy-id>
    edit 423
        set name "Block TO Phishing"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set internet-service enable
        set internet-service-name "Phishing-Phishing.Server"
        set schedule "always"
        set logtraffic all
        set action deny
    next
    move 423 before <insert-before-policy-id>
    edit 424
        set name "Block FROM Proxy"
        set srcintf "any"
        set dstintf "any"
        set dstaddr "all"
        set internet-service-src enable
        set internet-service-src-name "Proxy-Proxy.Server"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 424 before <insert-before-policy-id>
    edit 425
        set name "Block TO Proxy"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set internet-service enable
        set internet-service-name "Proxy-Proxy.Server"
        set schedule "always"
        set logtraffic all
        set action deny
    next
    move 425 before <insert-before-policy-id>
    edit 426
        set name "Block FROM Spam"
        set srcintf "any"
        set dstintf "any"
        set dstaddr "all"
        set internet-service-src enable
        set internet-service-src-name "Spam-Spamming.Server"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 426 before <insert-before-policy-id>
    edit 427
        set name "Block TO Spam"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set internet-service enable
        set internet-service-name "Spam-Spamming.Server"
        set schedule "always"
        set logtraffic all
        set action deny
    next
    move 427 before <insert-before-policy-id>
end
```
