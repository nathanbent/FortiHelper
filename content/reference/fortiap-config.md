---
id: fortiap-config
title: Wireless: SSIDs, profiles, and AP groups
topic: fortiap
kind: config
order: 17
runOn: fortigate
---

Starting templates, not verified on every release: option names and values shift between FortiOS versions, so check with ? in the CLI before pasting. Replace every <placeholder>. A tunnel-mode SSID is an interface on the FortiGate: give it an address, a DHCP server, and firewall policies. A bridge-mode SSID drops clients straight onto the AP's switch port, optionally in a VLAN.

### Tunnel-mode SSID, WPA2-Personal

```
config wireless-controller vap
    edit "<ssid-interface>"
        set ssid "<ssid-name>"
        set security wpa2-only-personal
        set passphrase <wifi-passphrase>
    next
end
```

### Bridge-mode SSID in a VLAN

The switch port the AP is on has to carry this VLAN tagged.

```
config wireless-controller vap
    edit "<ssid-interface>"
        set ssid "<ssid-name>"
        set security wpa2-only-personal
        set passphrase <wifi-passphrase>
        set local-bridging enable
        set vlanid <vlan-id>
    next
end
```

### WPA2-Enterprise SSID with RADIUS

The RADIUS server is a config user radius object.

```
config wireless-controller vap
    edit "<ssid-interface>"
        set ssid "<ssid-name>"
        set security wpa2-only-enterprise
        set auth radius
        set radius-server "<radius-server-name>"
    next
end
```

### VLAN assigned by RADIUS

Added to an enterprise SSID. Users the RADIUS server gives no VLAN land in vlanid.

```
config wireless-controller vap
    edit "<ssid-interface>"
        set dynamic-vlan enable
        set vlanid <vlan-id>
    next
end
```

### FortiAP profile

One profile per AP model. vap-all manual with a vaps list broadcasts only the SSIDs named; on older releases the value is disable. Repeat the radio block for radio-2.

```
config wireless-controller wtp-profile
    edit "<ap-profile-name>"
        config platform
            set type <ap-model>
        end
        config radio-1
            set darrp enable
            set vap-all manual
            set vaps "<ssid-interface>"
        end
    next
end
```

### Authorise an AP and give it a profile

```
config wireless-controller wtp
    edit "<ap-serial>"
        set admin enable
        set wtp-profile "<ap-profile-name>"
    next
end
```

### AP group

All members must be the same model.

```
config wireless-controller wtp-group
    edit "<ap-group-name>"
        set platform-type <ap-model>
        set wtps "<ap-serial>"
    next
end
```
