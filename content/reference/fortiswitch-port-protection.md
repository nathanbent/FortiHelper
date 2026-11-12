---
id: fortiswitch-port-protection
title: FortiSwitch — loop guard, storm control, DHCP snooping
topic: fortiswitch
kind: config
order: 63
---

Run on the FortiGate, not the switch. Starting templates, not verified on every release — option names shift between FortiOS versions, so check with ? in the CLI before pasting. Replace every <placeholder>.

### Loop guard on a port

Works alongside STP, not instead of it. The timeout is minutes until the port is re-enabled, 0 to 120.

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<port>"
                set loop-guard enabled
                set loop-guard-timeout 5
            next
        end
    next
end
```

### Storm control for all managed switch ports

Rate is packets per second.

```
config switch-controller storm-control
    set rate 500
    set unknown-unicast enable
    set unknown-multicast enable
    set broadcast enable
end
```

### DHCP snooping on a VLAN, with a trusted uplink

Ports are untrusted by default; trust only the ports that lead to the DHCP server.

```
config system interface
    edit "<vlan-interface>"
        set switch-controller-dhcp-snooping enable
        set switch-controller-dhcp-snooping-verify-mac enable
    next
end

config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<uplink-port>"
                set dhcp-snooping trusted
            next
        end
    next
end
```

### Dynamic ARP inspection on a VLAN

Needs DHCP snooping on the same VLAN, since it checks ARP against the snooping table.

```
config system interface
    edit "<vlan-interface>"
        set switch-controller-arp-inspection enable
    next
end

config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<uplink-port>"
                set arp-inspection-trust trusted
            next
        end
    next
end
```
