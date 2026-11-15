---
id: debug-stop
title: Stop debugging
topic: general
kind: diagnostics
copyAll: true
order: 80
---

Always run these when finished: debug output left on will load the CPU.

`diagnose debug disable` - Stop printing debug output
`diagnose debug reset` - Reset every debug level back to 0
`diagnose debug flow trace stop` - Stop a packet flow trace that is still counting down
`diagnose debug flow filter clear` - Clear the packet flow filter as well
`diagnose vpn ike log filter clear` - Clear the IKE debug filter as well
