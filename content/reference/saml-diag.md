---
id: saml-diag
title: SAML / SSO diagnostics
topic: saml
kind: diagnostics
order: 50
---

The auth daemon is where most SAML failures actually surface.

`show user saml` - Show the configured SAML servers and their endpoints
`diagnose debug application fnbamd -1` - Auth daemon — assertion handling and group lookups
`diagnose debug application saml -1` - SAML daemon
`diagnose debug application sslvpn -1` - SSL-VPN daemon, when SAML is the SSL-VPN login method
`diagnose debug enable` - Start printing debug output
`execute time` - Clock skew between FortiGate and IdP invalidates assertions
