---
id: fortiswitch-stp
title: FortiSwitch — spanning tree (STP / MSTP)
topic: fortiswitch
kind: config
order: 61
---

Run on the FortiGate, not the switch. Starting templates, not verified on every release — option names shift between FortiOS versions, so check with ? in the CLI before pasting. Replace every <placeholder>.

### MST region settings for every managed switch

```
config switch-controller stp-settings
    set name "<region-name>"
    set revision 1
    set hello-time 2
    set forward-time 15
    set max-age 20
    set max-hops 20
end
```

### Map VLANs to an MST instance

```
config switch-controller stp-instance
    edit 1
        set vlan-range "<vlan-interface-1>" "<vlan-interface-2>"
    next
end
```

### Bridge priority on one switch (make it root)

Priority is a multiple of 4096, from 0 to 61440; lowest wins. Instance 0 is the common spanning tree.

```
config switch-controller managed-switch
    edit "<switch-id>"
        config stp-instance
            edit 0
                set priority 4096
            next
        end
    next
end
```

### Edge port with BPDU guard (access ports)

BPDU guard only acts on a port that is an edge port with STP enabled. The timeout is minutes until the port is re-enabled, 0 to 120.

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<port>"
                set stp-state enabled
                set edge-port enable
                set stp-bpdu-guard enabled
                set stp-bpdu-guard-timeout 5
            next
        end
    next
end
```

### Root guard (ports that must never lead to the root)

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<port>"
                set stp-root-guard enabled
            next
        end
    next
end
```
