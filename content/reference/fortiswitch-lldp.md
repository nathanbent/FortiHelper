---
id: fortiswitch-lldp
title: FortiSwitch — LLDP profiles and voice VLAN
topic: fortiswitch
kind: config
order: 64.6
---

Run on the FortiGate, not the switch. Starting templates, not verified on every release — option names shift between FortiOS versions, so check with ? in the CLI before pasting. Replace every <placeholder>.

### Global LLDP timers

tx-interval is seconds between advertisements; neighbours keep an entry for tx-interval times tx-hold.

```
config switch-controller lldp-settings
    set tx-hold 4
    set tx-interval 30
    set fast-start-interval 2
    set management-interface internal
end
```

### LLDP-MED profile that hands phones a voice VLAN

The phone learns the voice VLAN, 802.1p priority, and DSCP from the network-policy TLV. The voice VLAN must also be in the port's allowed VLANs — add it with append allowed-vlans, since set replaces the list.

```
config switch-controller lldp-profile
    edit "<lldp-profile-name>"
        set med-tlvs inventory-management network-policy power-management
        set 802.1-tlvs port-vlan-id
        set 802.3-tlvs max-frame-size power-negotiation
        config med-network-policy
            edit "voice"
                set status enable
                set vlan-intf "<voice-vlan-interface>"
                set assign-vlan enable
                set priority 5
                set dscp 46
            next
            edit "voice-signaling"
                set status enable
                set vlan-intf "<voice-vlan-interface>"
                set assign-vlan enable
                set priority 3
                set dscp 24
            next
        end
    next
end
```

### Apply the profile to a port

lldp-status is disable, rx-only, tx-only, or tx-rx.

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<port>"
                set lldp-status tx-rx
                set lldp-profile "<lldp-profile-name>"
            next
        end
    next
end
```

### Stop a port from forming an inter-switch link automatically

For an edge profile on ports where another switch should never be trusted as an ISL.

```
config switch-controller lldp-profile
    edit "<lldp-profile-name>"
        set auto-isl disable
    next
end
```
