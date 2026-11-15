---
id: fortiswitch-remote-checks
title: FortiSwitch: 802.1X state and switch-native commands
topic: fortiswitch
kind: diagnostics
order: 60.6
runOn: fortigate
---

Draft, not verified on every release. The switch-info subcommands cover the common features; type diagnose switch-controller switch-info ? to see what your release offers. For anything it does not cover, a custom command runs a FortiSwitch-native CLI command on a switch and returns the output, without logging in to it.

`diagnose switch-controller switch-info 802.1X <FortiSwitch_serial_number>` - 802.1X state of every port: mode, link, and whether the port is authorised
`diagnose switch-controller switch-info stp <FortiSwitch_serial_number> <instance>` - Spanning-tree state and root for an MST instance (0 = common tree)
`diagnose switch-controller switch-info poe summary <FortiSwitch_serial_number>` - Power budget and per-port PoE state
`execute switch-controller custom-command <command-name> <FortiSwitch_serial_number>` - Run a custom command, defined below, on one switch and show its output

### Define a custom command

The command text is FortiSwitchOS CLI, not FortiOS. Separate several lines with %0a.

```
config switch-controller custom-command
    edit "<command-name>"
        set command "diagnose switch physical-ports summary"
    next
end
```
