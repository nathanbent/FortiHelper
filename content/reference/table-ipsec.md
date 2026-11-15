---
id: table-ipsec
title: IPsec ports, protocols, and DH groups
topic: ipsec
kind: table
order: 45
---

What a firewall between two IPsec peers has to pass, and what the Diffie-Hellman group numbers in a proposal mean. Both ends must offer at least one group in common. Groups 1, 2, and 5 are too weak to use; 14 is the practical minimum, and the elliptic-curve groups give more strength for less CPU.

```table
UDP 500 - IKE: phase 1 and phase 2 negotiation
UDP 4500 - IKE and ESP when NAT is detected between the peers (NAT-T)
IP protocol 50 - ESP: the encrypted traffic, when there is no NAT
IP protocol 51 - AH: authentication only, rarely used
DH 14 - 2048-bit MODP
DH 15 - 3072-bit MODP
DH 16 - 4096-bit MODP
DH 19 - 256-bit elliptic curve
DH 20 - 384-bit elliptic curve
DH 21 - 521-bit elliptic curve
DH 31 - Curve25519
DH 1, 2, 5 - 768, 1024, and 1536-bit MODP. Obsolete
```
