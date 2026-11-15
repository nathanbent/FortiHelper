---
id: ipsec-debug-filter
title: IPsec: filtered IKE debug
topic: ipsec
kind: diagnostics
copyAll: true
order: 20
---

Filter before enabling debug on a busy firewall, or the output from every other tunnel will bury the one you care about.

`diagnose vpn ike log filter clear` - Clear any filter left over from a previous session
`diagnose vpn ike log filter dst-addr4 <peer-ip>` - Restrict IKE debug to one peer
`diagnose debug console timestamp enable` - Enable timestamps on debug output
`diagnose debug application ike -1` - Debug the IKE daemon (IPsec negotiation)
`diagnose debug enable` - Start printing debug output
> Bring the tunnel up from either end, then read the negotiation. "no SA proposal chosen" means the two ends offer different proposals. A pre-shared key mismatch shows as an authentication failure right after the proposals are accepted. No output at all means the peer's packets are not arriving: check UDP 500 and 4500 with the sniffer.
