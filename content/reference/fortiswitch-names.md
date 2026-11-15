---
id: fortiswitch-names
title: FortiSwitch and FortiAP: names and IDs
topic: fortiswitch
kind: config
order: 59.8
runOn: fortigate
---

Starting templates, not verified on every release: check with ? in the CLI before pasting. Replace every <placeholder>. A managed switch's ID is the edit key that every other switch-controller command uses. It starts as the serial number; from FortiOS 7.4.0 it can be renamed, as often as needed, and the serial is kept in a read-only field. For a whole list of devices, the Switch & AP Onboarding tool writes these blocks from a spreadsheet.

`show switch-controller managed-switch` - Every switch as configured: its ID, name, description, and ports
`get switch-controller managed-switch status` - Each switch's ID, serial number, firmware, and state
`show wireless-controller wtp` - Every AP as configured: serial number, name, location, and profile

### Rename a switch (FortiOS 7.4+)

The first value is the switch's current ID, whatever that is now. On a switch that has never been renamed that is its serial number; to rename it a second time, give the name it has now, not the serial. show switch-controller managed-switch lists the current IDs. The switch must already be listed on the FortiGate: if the current ID is not there, the rename fails, and a later edit of the new name creates an empty entry with no serial behind it. Use letters, digits, hyphens, and underscores only: 16 characters at most on early 7.4 builds, 35 later. Other commands, groups, and logs use the new ID from then on, so rename before building anything that refers to the switch. On a downgrade below 7.4 the ID goes back to the serial number.

```
config switch-controller managed-switch
    rename "<switch-id>" to "<switch-name>"
end
```

### Give a switch a display name (FortiOS 7.2 and earlier)

set name was removed in FortiOS 7.4.0, where the ID itself is the name: rename the switch instead. On 7.2 and earlier this leaves the ID as the serial number; the name shows in the GUI and other commands still need the ID.

```
config switch-controller managed-switch
    edit "<FortiSwitch_serial_number>"
        set name "<switch-name>"
    next
end
```

### Describe a switch (any release)

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
