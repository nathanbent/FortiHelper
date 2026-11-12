---
id: fortiswitch-igmp
title: FortiSwitch — IGMP snooping
topic: fortiswitch
kind: config
order: 62
---

Run on the FortiGate, not the switch. Starting templates, not verified on every release — option names shift between FortiOS versions, so check with ? in the CLI before pasting. Replace every <placeholder>.

### Global IGMP-snooping settings

With flood-unknown-multicast disabled, unregistered multicast goes only to router ports; enabled, it floods the VLAN.

```
config switch-controller igmp-snooping
    set aging-time 300
    set flood-unknown-multicast disable
end
```

### Turn snooping on for a VLAN

```
config system interface
    edit "<vlan-interface>"
        set switch-controller-igmp-snooping enable
        set switch-controller-igmp-snooping-proxy enable
        set switch-controller-igmp-snooping-fast-leave enable
    next
end
```

### Per-switch override and querier (FortiOS 7.0.2+)

A VLAN with no multicast router needs a querier, or group memberships age out.

```
config switch-controller managed-switch
    edit "<switch-id>"
        config igmp-snooping
            set local-override enable
            set aging-time 300
            set flood-unknown-multicast disable
            config vlans
                edit "<vlan-interface>"
                    set querier enable
                    set querier-addr <querier-ip>
                    set version 2
                next
            end
        end
    next
end
```

### Flood reports and multicast on a port (uplink to a multicast router)

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<port>"
                set igmp-snooping-flood-reports enable
                set mcast-snooping-flood-traffic enable
            next
        end
    next
end
```
