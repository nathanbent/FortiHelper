---
id: fortiswitch-trunks
title: FortiSwitch: LAG, MCLAG, and custom commands
topic: fortiswitch
kind: config
order: 64
runOn: fortigate
---

Option names and values checked against the FortiOS 7.6 CLI reference and FortiLink guide, but not pasted into a device. Older releases can differ, so check with ? in the CLI before pasting. Replace every <placeholder>.

`execute switch-controller custom-command <command-name> <switch-id>` - Run a custom command once on one switch, without binding it

### LACP trunk (LAG) on one switch

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<trunk-name>"
                set type trunk
                set mode lacp-active
                set members "<port-a>" "<port-b>"
            next
        end
    next
end
```

### MCLAG inter-chassis link between two switches

Apply to the ICL ports on both peers.

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<icl-port>"
                set lldp-profile default-auto-mclag-icl
            next
        end
    next
end
```

### MCLAG trunk to a server or downstream switch

Create the trunk with the same name on both MCLAG peers.

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<trunk-name>"
                set type trunk
                set mode lacp-active
                set mclag enable
                set members "<port>"
            next
        end
    next
end
```

### Push FortiSwitch-native CLI with a custom command

For settings FortiOS has no option for. Lines are separated by %0a; the command is re-applied whenever the switch config syncs.

```
config switch-controller custom-command
    edit "<command-name>"
        set command "config switch stp settings %0a set max-age 10 %0a end %0a"
    next
end

config switch-controller managed-switch
    edit "<switch-id>"
        config custom-command
            edit 1
                set command-name "<command-name>"
            next
        end
    next
end
```
