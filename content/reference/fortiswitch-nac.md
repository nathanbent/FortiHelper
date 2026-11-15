---
id: fortiswitch-nac
title: FortiSwitch: NAC policies
topic: fortiswitch
kind: config
order: 64.9
runOn: fortigate
---

Starting templates, not verified on every release: NAC settings moved between FortiOS 6.4, 7.0 and 7.2, so check with ? in the CLI before pasting. Replace every <placeholder>. A port in NAC mode starts every device in the onboarding VLAN; when a NAC policy matches the device, its MAC policy moves the device to the right VLAN.

`show switch-controller nac-device` - Devices NAC has matched, with the policy and the VLAN they were given

### Put a port in NAC mode

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<port>"
                set access-mode nac
            next
        end
    next
end
```

### MAC policy: the VLAN a matched device gets

```
config switch-controller mac-policy
    edit "<mac-policy-name>"
        set fortilink "<fortilink-interface>"
        set vlan "<vlan-interface>"
    next
end
```

### NAC policy: match devices by MAC address

category device can also match on vendor, family, or operating system in place of a MAC pattern.

```
config user nac-policy
    edit "<policy-name>"
        set category device
        set mac "<mac-pattern>"
        set switch-fortilink "<fortilink-interface>"
        set switch-mac-policy "<mac-policy-name>"
    next
end
```
