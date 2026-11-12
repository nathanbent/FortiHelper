---
id: fortiswitch-qos
title: FortiSwitch — QoS
topic: fortiswitch
kind: config
order: 64.4
---

Run on the FortiGate, not the switch. Starting templates, not verified on every release — option names shift between FortiOS versions, so check with ? in the CLI before pasting. Replace every <placeholder>.

### Map 802.1p (CoS) values to egress queues

```
config switch-controller qos dot1p-map
    edit "<dot1p-map-name>"
        set priority-0 queue-0
        set priority-1 queue-1
        set priority-2 queue-2
        set priority-3 queue-3
        set priority-4 queue-4
        set priority-5 queue-5
        set priority-6 queue-6
        set priority-7 queue-7
    next
end
```

### Map DSCP values to egress queues

One entry per queue; diffserv takes one or more DSCP names (CS0 to CS7, AF11 to AF43, EF).

```
config switch-controller qos ip-dscp-map
    edit "<dscp-map-name>"
        config map
            edit "voice"
                set cos-queue 5
                set diffserv EF
            next
            edit "signaling"
                set cos-queue 3
                set diffserv CS3 AF31
            next
        end
    next
end
```

### Egress queue policy

schedule is strict, round-robin, or weighted; weights only matter for weighted. A max-rate of 0 is unlimited.

```
config switch-controller qos queue-policy
    edit "<queue-policy-name>"
        set schedule weighted
        set rate-by kbps
        config cos-queue
            edit "queue-5"
                set description "voice"
                set weight 8
                set min-rate 0
                set max-rate 0
            next
            edit "queue-0"
                set description "best-effort"
                set weight 1
            next
        end
    next
end
```

### QoS policy tying the maps and queue policy together

Trust either 802.1p or DSCP on a port, not both — when both are set the switch goes by DSCP. default-cos is used for untagged traffic.

```
config switch-controller qos qos-policy
    edit "<qos-policy-name>"
        set default-cos 0
        set trust-ip-dscp-map "<dscp-map-name>"
        set queue-policy "<queue-policy-name>"
    next
end
```

### Apply the QoS policy to a port

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<port>"
                set qos-policy "<qos-policy-name>"
            next
        end
    next
end
```
