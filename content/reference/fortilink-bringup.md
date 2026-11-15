---
id: fortilink-bringup
title: FortiLink: bring switches online
topic: fortiswitch
kind: diagnostics
order: 59
runOn: fortigate
---

Draft, not verified on every release. Work down the list when a switch will not appear or will not stay online. Most failures are one of: the switch controller or FortiLink not enabled, the switch not authorised, bad time on the switch (it takes NTP from the FortiLink interface), leftover config on a switch that was used before, or a FortiSwitchOS release the FortiOS release does not support.

`execute switch-controller get-conn-status` - Every managed switch: authorised or not, up or down
> Authorized/Up is the goal. Authorized/Down on a good cable often means old config is still on the switch: factory-reset it and let it rediscover.
`execute switch-controller diagnose-connection <FortiSwitch_serial_number>` - Step-by-step check of one switch's FortiLink connection
`execute switch-controller get-physical-conn standard <fortilink-interface>` - How the switches are cabled to the FortiGate and to each other
`execute switch-controller get-sync-status all` - Whether each switch has taken the FortiGate's config
> A switch that is Up but shows an error against CONFIG or MAC-SYNC has a sync problem, not a link problem: trigger a config sync.
`diagnose switch-controller trigger config-sync <FortiSwitch_serial_number>` - Push the complete config to one switch again
`show system interface <fortilink-interface>` - The FortiLink interface as configured: fortilink enable, address, auto-authorisation
`diagnose sys ntp status` - The FortiGate's own time sync, which the switches inherit

### FortiLink interface

Recent FortiGates ship with an aggregate interface named fortilink that is already set up like this. On an aggregate whose members go to two different switches, also set fortilink-split-interface enable; leave it disabled when both members go to the same switch.

```
config system interface
    edit "<fortilink-interface>"
        set fortilink enable
        set ip <fortilink-ip> <fortilink-mask>
        set allowaccess ping fabric
        set auto-auth-extension-device enable
    next
end
```

### NTP for the switches

```
config system ntp
    set ntpsync enable
    set server-mode enable
    set interface "<fortilink-interface>"
end
```

### Authorise a discovered switch

Not needed when auto-auth-extension-device is enabled. The switch reboots when it is authorised.

```
config switch-controller managed-switch
    edit "<switch-id>"
        set fsw-wan1-admin enable
    next
end
```
