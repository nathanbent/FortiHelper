---
id: ipsec-flush
title: IPsec — force a renegotiation
topic: ipsec
kind: diagnostics
order: 30
---

Tears the tunnel down so it rebuilds — expect a brief outage on that tunnel.

`diagnose vpn tunnel flush <phase1-name>` - Flush the phase 2 SAs for one tunnel
`diagnose vpn ike gateway flush name <phase1-name>` - Flush the phase 1 gateway, forcing a full renegotiation
`diagnose vpn ike gateway clear` - Clear every IKE gateway — affects all tunnels
