---
id: auth-test-servers
title: Test LDAP and RADIUS servers
topic: auth
kind: diagnostics
order: 10
---

Draft, not verified on every release. Tests a login against a server object straight from the FortiGate, with no user group or policy needed. The server name is the object's name on the FortiGate, not the server's hostname; quote it if it has spaces. The password is typed on the command line, so it lands in your terminal history and scrollback: use a test account.

`diagnose test authserver ldap <server-name> <username> <password>` - Try an LDAP bind and login as one user
> Success lists the groups the user belongs to. A failure with no groups usually means a wrong bind DN, base DN, or common name identifier in the server object.
`diagnose test authserver radius <server-name> mschap2 <username> <password>` - Try a RADIUS login. The scheme can be pap, chap, mschap, or mschap2 and must be one the server accepts
`diagnose debug application fnbamd -1` - Debug the authentication daemon: run it before a test for the full exchange
`diagnose debug enable` - Start printing debug output
`diagnose sniffer packet any 'port 1812' 4 0 l` - Are RADIUS requests leaving, and is anything coming back?
> Requests with no replies: the server does not have the FortiGate as a client, the shared secret is wrong, or the source address is not the one the server expects.
`diagnose sniffer packet any 'port 389 or port 636' 4 0 l` - The same for LDAP and LDAPS
