---
id: fortiap-on-ap
title: FortiAP: on the AP itself
topic: fortiap
kind: diagnostics
order: 14
runOn: fortiap
---

Draft, not verified on every release. Typed into the AP's own CLI, over its console port or SSH, for when it will not join. Settings changed with cfg -a do nothing until cfg -c saves them.

`fap-get-status` - Model, serial number, and firmware of the AP
`cfg -s` - Show the AP's local settings, including how it looks for a controller
> AC_DISCOVERY_TYPE says how it looks: 0 automatic, 1 static, 2 DHCP. With DHCP, AC_DISCOVERY_DHCP_OPTION_CODE must match the option the DHCP server sends (138 by default).
`cfg -a AC_DISCOVERY_TYPE=1` - Use a static controller address
`cfg -a AC_IPADDR_1=<fortigate-ip>` - The controller to join
`cfg -c` - Save the changes
`cw_diag kernel-panic` - Show the last crash, if there was one
`factoryreset` - Return the AP to factory defaults. It reboots
