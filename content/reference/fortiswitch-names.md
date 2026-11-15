---
id: fortiswitch-names
title: FortiSwitch and FortiAP: names and IDs
topic: fortiswitch
kind: config
order: 59.8
runOn: fortigate
---

Starting templates, not verified on every release: check with ? in the CLI before pasting. Replace every <placeholder>. A managed switch's ID is the edit key that every other switch-controller command uses. It starts as the serial number; from FortiOS 7.4.0 it can be renamed, and the serial is kept in a read-only field. For a whole list of devices, the Switch & AP Onboarding tool writes these blocks from a spreadsheet.

`show switch-controller managed-switch` - Every switch as configured: its ID, name, description, and ports
`get switch-controller managed-switch status` - Each switch's ID, serial number, firmware, and state
`show wireless-controller wtp` - Every AP as configured: serial number, name, location, and profile

### Rename a switch's ID from its serial number (FortiOS 7.4+)

The switch must already be listed on the FortiGate. Use letters, digits, hyphens, and underscores only: 16 characters at most in the 7.4.1 and 7.6.1 CLI reference, 35 in the 7.6.8 one. Other commands, groups, and logs use the new ID from then on, so rename before building anything that refers to the switch. On a downgrade below 7.4 the ID goes back to the serial number.

```
config switch-controller managed-switch
    rename "<FortiSwitch_serial_number>" to "<switch-name>"
end
```

### Give a switch a display name (FortiOS 7.2 and earlier)

Leaves the ID as the serial number. The name shows in the GUI; other commands still need the ID. FortiOS 7.4 removed this option: there the ID is the name, so rename the switch instead.

```
config switch-controller managed-switch
    edit "<switch-id>"
        set name "<switch-name>"
    next
end
```

### Describe a switch (any release)

Free text, up to 63 characters.

```
config switch-controller managed-switch
    edit "<switch-id>"
        set description "<switch-description>"
    next
end
```

### Name an AP and record where it is

An AP's ID is always its serial number: it cannot be renamed.

```
config wireless-controller wtp
    edit "<ap-serial>"
        set name "<ap-name>"
        set location "<ap-location>"
    next
end
```
