---
id: fortiswitch-poe
title: FortiSwitch — PoE
topic: fortiswitch
kind: config
order: 64.8
---

Run on the FortiGate, not the switch. Starting templates, not verified on every release — option names shift between FortiOS versions, so check with ? in the CLI before pasting. Replace every <placeholder>.

`execute switch-controller switch-action poe reset <FortiSwitch_serial_number> <port>` - Power-cycle a PoE port (FortiOS 7.4 and later)

`execute switch-controller poe-reset <FortiSwitch_serial_number> <port>` - Power-cycle a PoE port (older FortiOS)

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

When the power budget runs out, low-priority ports lose power first. Priority is critical-priority, high-priority, medium-priority, or low-priority; mode is ieee802-3af (15.4 W) or ieee802-3at (30 W). Not every model has these options.

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
