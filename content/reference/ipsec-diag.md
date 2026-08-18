---
id: ipsec-diag
title: IPsec / SAML debug sequence
topic: ipsec
kind: diagnostics
copyAll: true
order: 40
---

The unfiltered catch-all sequence, for auth-related tunnel problems.

`diag debug console timestamp enable` - Enable timestamps on debug output
`diag debug app fnbamd -1` - Debug the fnbamd auth daemon (all levels)
`diag debug app saml -1` - Debug the SAML daemon
`diag debug app ike -1` - Debug the IKE daemon (IPsec negotiation)
`diag debug app eap_proxy -1` - Debug the EAP proxy daemon
`diag debug enable` - Start printing debug output
