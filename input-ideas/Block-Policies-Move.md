# Recommended Block Policies
## General
- Version 2
- Policies start at 400 for GeoIP and 410 for ISDB
- Follows recommended blocks from https://workbench.cisecurity.org/sections/3894634/recommendations/6504793
- Uses "any" interface, so multi-interface policies must be enabled
- Or can find and replace:
    - set srcintf "any" to set srcintf "<Desired Src>"
    - set dstintf "any" to set dstintf "<Desired Dst>"
- Internet Service DB (ISDB) requires a subscription- those policies will error out if the services are not active.

## What This Script Does
Creates deny policies for both inbound and outbound traffic matching known malicious or untrusted sources/destinations.

### GeoIP Blocks (Policies 400–401)
Blocks traffic to/from untrusted countries:
- China, Russia, Iran, Ukraine, Netherlands, Latvia, Greece, N. Korea, India, Pakistan, Bangladesh, Afghanistan

### Internet Service DB (ISDB) Blocks (Policies 411–427)
Blocks traffic to/from known malicious internet services:
- **Scanners** – Shodan, Censys, Stretchoid, InterneTTL, Tenable, NetScout, Recyber, Cyber.Casa, BinaryEdge, Rapid7, UK NCSC, CriminalIP, Internet Census Group, Shadowserver, LeakIX, Hadrian, ONYPHE, Modat, Palo Alto Networks Cortex Xpanse
- **Malicious Servers** – Known malicious server infrastructure
- **Tor** – Tor relay, exit, and general Tor nodes
- **VPN** – Anonymous VPN services
- **Botnet** – Botnet command & control servers
- **THE Hosting** – THE Hosting hosting service
- **Phishing** – Known phishing servers
- **Proxy** – Known proxy servers
- **Spam** – Known spamming servers

Find and replace <Insert-At> to move policies to correct area

```
## United States GeoIP
config firewall address
    edit "GeoIP - USA"
        set type geography
        set color 3
        set country "US"
    next
end

# Untrusted GeoIPs
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
    edit "Untrusted Geo-IP Regions"
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
        set srcaddr "Untrusted Geo-IP Regions"
        set dstaddr "all"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
        set global-label "Global Blocks"
    next
    move 400 before <Insert-At>
        edit 401
        set name "Block TO Risky Countries"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set dstaddr "Untrusted Geo-IP Regions"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set action deny
    next
    move 401 before <Insert-At>
end


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
    move 411 before <Insert-At>
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
    move 412 before <Insert-At>
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
    move 413 before <Insert-At>
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
    move 414 before <Insert-At>
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
    move 415 before <Insert-At>
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
    move 416 before <Insert-At>
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
    move 417 before <Insert-At>
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
    move 418 before <Insert-At>
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
    move 419 before <Insert-At>
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
    move 420 before <Insert-At>
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
    move 421 before <Insert-At>
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
    move 422 before <Insert-At>
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
    move 423 before <Insert-At>
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
    move 424 before <Insert-At>
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
    move 425 before <Insert-At>
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
    move 426 before <Insert-At>
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
    move 427 before <Insert-At>
end
```

## Additional Block Policies
```
### Add external objects
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

### Add Firewall policies for external objects
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
    next
    move 441 before <Insert-At>
    edit 442
        set name "Any to WAN - Block EmergingThreats"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set dstaddr "Bad IP Blocks - EmergingThreats.net" "Bad IPs - EmergingThreats.net" "Compromised IPs-EmergingThreats"
        set schedule "always"
        set service "ALL"
        set logtraffic all
    next
    move 442 before <Insert-At>
    edit 443
        set name "WAN to Any - Blocklist.de"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "Bad IPs & IP Blocks - Blocklist.de"
        set dstaddr "all"
        set schedule "always"
        set service "ALL"
        set logtraffic all
    next
    move 443 before <Insert-At>
    edit 444
        set name "Any to WAN - Blocklist.de"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set dstaddr "Bad IPs & IP Blocks - Blocklist.de"
        set schedule "always"
        set service "ALL"
        set logtraffic all
    next
    move 444 before <Insert-At>
    edit 445
        set name "WAN to Any - Alienvault"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "Reputation - Alienvault"
        set dstaddr "all"
        set schedule "always"
        set service "ALL"
        set logtraffic all
    next
    move 445 before <Insert-At>
    edit 446
        set name "Any to WAN - Alienvault"
        set srcintf "any"
        set dstintf "any"
        set srcaddr "all"
        set dstaddr "Reputation - Alienvault"
        set schedule "always"
        set service "ALL"
        set logtraffic all
    next
    move 446 before <Insert-At>
end
```