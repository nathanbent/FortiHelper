---
id: fortiap-capwap
title: FortiAP: not joining the controller
topic: fortiap
kind: diagnostics
order: 13
runOn: fortigate
---

Draft, not verified on every release. An AP reaches its controller over CAPWAP: UDP 5246 for control and 5247 for data. The FortiGate interface the AP arrives on must allow Security Fabric Connection (fabric in allowaccess), and anything between the two must pass both ports. On the same subnet the AP finds the controller by broadcast; across a router it needs DHCP option 138, DNS, or a static address set on the AP.

`get wireless-controller wtp-status` - Is the AP known to the controller at all?
`diagnose sniffer packet any 'udp port 5246' 4 0 l` - Are the AP's CAPWAP requests arriving, and is the FortiGate answering?
> Requests with no replies: fabric access is missing on that interface, or the AP is not authorised. No requests at all: the AP cannot find or reach the FortiGate.
`diagnose wireless-controller wlac wtp_filter <ap-serial> 0-<ap-ip>:5246 2` - Limit the controller debug to one AP
`diagnose debug application cw_acd 0x7ff` - Debug the wireless controller daemon
`diagnose debug console timestamp enable` - Enable timestamps on debug output
`diagnose debug enable` - Start printing debug output
`diagnose debug crashlog read` - Look for cw_acd crashes when every AP drops at once
`execute wireless-controller restart-acd` - Restart the wireless controller daemon. Disconnects every AP: a last resort

### Allow APs to reach the controller on an interface

append adds to the access list; set would replace it.

```
config system interface
    edit "<interface>"
        append allowaccess fabric
    next
end
```
