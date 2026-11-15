---
id: fortiswitch-vlans
title: FortiSwitch: VLANs and port assignment
topic: fortiswitch
kind: config
order: 60.9
runOn: fortigate
---

Starting templates, not verified on every release: option names shift between FortiOS versions, so check with ? in the CLI before pasting. Replace every <placeholder>. A FortiSwitch VLAN is a VLAN interface on the FortiGate's FortiLink interface; ports are then given a native VLAN and, for trunks, a list of allowed VLANs.

### Create a VLAN on the FortiLink interface

Add a DHCP server and firewall policies for it as for any other interface.

```
config system interface
    edit "<vlan-interface>"
        set vdom "root"
        set ip <vlan-ip> <vlan-mask>
        set allowaccess ping
        set interface "<fortilink-interface>"
        set vlanid <vlan-id>
    next
end
```

### Access port: one untagged VLAN

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<port>"
                set vlan "<vlan-interface>"
            next
        end
    next
end
```

### Trunk port: a native VLAN plus tagged VLANs

For a FortiAP carrying bridged SSIDs, the native VLAN is the AP's management VLAN and the allowed VLANs are the SSIDs' VLANs. To send one of the allowed VLANs untagged as well, list it under untagged-vlans.

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<port>"
                set vlan "<vlan-interface>"
                set allowed-vlans "<vlan-interface-1>" "<vlan-interface-2>"
            next
        end
    next
end
```

### Stop devices in a VLAN talking to each other

Access VLAN: traffic between hosts in the VLAN is sent through the FortiGate, where policies decide. Needs proxy ARP for the hosts to still reach each other where allowed.

```
config system interface
    edit "<vlan-interface>"
        set switch-controller-access-vlan enable
    next
end
```
