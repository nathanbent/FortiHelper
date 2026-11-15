---
id: traffic-sniffer
title: Packet sniffer
topic: traffic
kind: diagnostics
order: 2
---

Shows whether packets arrive and which interface they leave by. Draft, not verified on every release. The arguments after the filter are verbosity, packet count (0 = until Ctrl-C), and timestamp format (l = local time, a = UTC). Verbosity 4 prints headers with the interface name, which is what you want most of the time; 6 adds the full packet for conversion to a pcap. Traffic offloaded to an NP chip is mostly invisible here: set auto-asic-offload disable on the policy while testing. Replace any with an interface name to narrow the capture.

`diagnose sniffer packet any 'host <host-ip>' 4 0 l` - Everything to or from one address, on every interface
`diagnose sniffer packet any 'host <host-ip> and port <dest-port>' 4 0 l` - One address and one TCP or UDP port
`diagnose sniffer packet any 'host <host-ip> and icmp' 4 0 l` - Pings to or from one address
`diagnose sniffer packet any 'src host <source-ip> and dst host <dest-ip>' 4 0 l` - One direction of a conversation
`diagnose sniffer packet any 'net <subnet-cidr>' 4 0 l` - A whole subnet, written as 10.1.2.0/24
`diagnose sniffer packet any 'host <host-ip> and tcp[13] & 2 != 0' 4 0 l` - Only TCP SYN packets: is the connection attempt arriving at all?
`diagnose sniffer packet any 'host <host-ip> and tcp[13] & 4 != 0' 4 0 l` - Only TCP RST packets: who is resetting the connection?
`diagnose sniffer packet <interface> 'host <host-ip>' 6 0 l` - Full packets on one interface, for conversion to a pcap
