---
id: fortiswitch-poe
title: FortiSwitch: PoE
topic: fortiswitch
kind: config
order: 64.8
runOn: fortigate
---

Option names and values checked against the FortiOS 7.6 CLI reference and FortiLink guide, but not pasted into a device. Older releases can differ, so check with ? in the CLI before pasting. Replace every <placeholder>.

`execute switch-controller switch-action poe reset <FortiSwitch_serial_number> <port>` - Power-cycle a PoE port [7.4+]

`execute switch-controller poe-reset <FortiSwitch_serial_number> <port>` - Power-cycle a PoE port [<7.4]

`get switch-controller poe <FortiSwitch_serial_number> <port>` - PoE status and power draw of a port

`diagnose switch-controller switch-info poe summary <FortiSwitch_serial_number>` - Power budget and per-port PoE state of a switch

### Turn PoE on or off for a port

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<port>"
                set poe-status enable
            next
        end
    next
end
```

### Detect pre-standard (legacy) PoE devices

Off by default. Set on the switch, and on the port where the legacy device is.

```
config switch-controller managed-switch
    edit "<switch-id>"
        set poe-pre-standard-detection enable
        config ports
            edit "<port>"
                set poe-pre-standard-detection enable
            next
        end
    next
end
```

### Port priority and power mode

When the power budget runs out, low-priority ports lose power first. Priority is critical-priority, high-priority, medium-priority, or low-priority; mode is ieee802-3af (15.4 W), ieee802-3at (30 W), or ieee802-3bt on models that have it. Needs FortiOS 7.2.4 and FortiSwitchOS 7.2.3 or later.

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<port>"
                set poe-port-priority high-priority
                set poe-port-mode ieee802-3at
            next
        end
    next
end
```
