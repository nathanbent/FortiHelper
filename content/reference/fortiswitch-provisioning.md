---
id: fortiswitch-provisioning
title: Pre-provision and group switches and APs
topic: fortiswitch
kind: config
order: 59.9
runOn: fortigate
---

Starting templates, not verified on every release: check with ? in the CLI before pasting. Replace every <placeholder>. These are the blocks the Switch & AP Onboarding tool writes for a whole spreadsheet; use them here for one device at a time. A device can be entered before it is plugged in, so it is authorised and configured the moment it connects.

### Pre-provision a switch under a name (FortiOS 7.4+)

The edit key is the name the switch will be known by; set sn ties it to the hardware. The FortiLink interface has to be given before a switch that has never connected can be authorised.

```
config switch-controller managed-switch
    edit "<switch-name>"
        set sn "<FortiSwitch_serial_number>"
        set fsw-wan1-peer "<fortilink-interface>"
        set fsw-wan1-admin enable
        set description "<switch-description>"
    next
end
```

### Pre-provision a switch by serial number (FortiOS 7.2 and earlier)

```
config switch-controller managed-switch
    edit "<FortiSwitch_serial_number>"
        set name "<switch-name>"
        set fsw-wan1-peer "<fortilink-interface>"
        set fsw-wan1-admin enable
        set description "<switch-description>"
    next
end
```

### Reject a switch, or send it back to waiting

fsw-wan1-admin is enable to authorise, disable to refuse, and discovered to put the switch back in the queue waiting for approval.

```
config switch-controller managed-switch
    edit "<switch-id>"
        set fsw-wan1-admin disable
    next
end
```

### Give a switch its profiles

The switch profile holds the admin login pushed to the switch; the access profile holds which management protocols its ports answer.

```
config switch-controller managed-switch
    edit "<switch-id>"
        set switch-profile "<switch-profile-name>"
        set access-profile "<access-profile-name>"
    next
end
```

### Add a switch to a switch group

append adds to the members already there; set members would replace the whole list.

```
config switch-controller switch-group
    edit "<switch-group-name>"
        set fortilink "<fortilink-interface>"
        append members "<switch-id>"
    next
end
```

### Pre-provision an AP

An AP's ID is always its serial number. admin takes enable, disable, or discovered, as for a switch. Each AP model has a default profile named after it, such as FAP231F-default.

```
config wireless-controller wtp
    edit "<ap-serial>"
        set admin enable
        set name "<ap-name>"
        set location "<ap-location>"
        set wtp-profile "<ap-profile-name>"
    next
end
```

### Add an AP to an AP group

The AP must already exist as a wtp entry. A group holds one model, set before its first member, and an AP belongs to one group only.

```
config wireless-controller wtp-group
    edit "<ap-group-name>"
        set platform-type <ap-model>
        append wtps "<ap-serial>"
    next
end
```
