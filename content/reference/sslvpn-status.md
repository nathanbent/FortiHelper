---
id: sslvpn-status
title: SSL VPN: sessions and debug
topic: remote
kind: diagnostics
order: 10
---

Draft, not verified on every release. From FortiOS 7.6.3 SSL VPN tunnel mode is gone, replaced by IPsec, and web mode is renamed Agentless VPN: on those releases these commands apply to what remains. Filter the debug to one client on a busy unit. Run Stop debugging when finished.

`get vpn ssl monitor` - Who is connected, from where, and the address each tunnel was given
`execute vpn sslvpn list` - The same sessions with the index number needed to disconnect one
`execute vpn sslvpn del-tunnel <tunnel-index>` - Disconnect one tunnel session
`diagnose vpn ssl statistics` - Connection counts and memory use of the SSL VPN daemon
`diagnose vpn ssl debug-filter src-addr4 <client-public-ip>` - Limit the debug to one client's public address
`diagnose vpn ssl debug-filter clear` - Remove that filter
`diagnose debug application sslvpn -1` - Debug the SSL VPN daemon
`diagnose debug application fnbamd -1` - Debug authentication, when the login itself fails
`diagnose debug console timestamp enable` - Enable timestamps on debug output
`diagnose debug enable` - Start printing debug output
> Follow one login: the TLS handshake, the authentication result, then the portal and address assignment. A login that authenticates and then drops usually has no matching firewall policy for the user's group.
