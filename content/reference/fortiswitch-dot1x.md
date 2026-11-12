---
id: fortiswitch-dot1x
title: FortiSwitch — 802.1X port security
topic: fortiswitch
kind: config
order: 64.2
---

Run on the FortiGate, not the switch. Starting templates, not verified on every release — option names shift between FortiOS versions, so check with ? in the CLI before pasting. Replace every <placeholder>.

### 802.1X security policy

security-mode is 802.1X (port-based: one login opens the port) or 802.1X-mac-based (every device authenticates). The user group must hold the RADIUS server.

```
config switch-controller security-policy 802-1X
    edit "<policy-name>"
        set security-mode 802.1X-mac-based
        set user-group "<radius-user-group>"
        set mac-auth-bypass disable
        set eap-passthru enable
        set guest-vlan disable
        set auth-fail-vlan disable
    next
end
```

### MAC authentication bypass, guest VLAN, and auth-fail VLAN

MAB lets devices with no supplicant (printers, cameras) authenticate by MAC address. The guest VLAN takes devices that never answer; the auth-fail VLAN takes those that fail.

```
config switch-controller security-policy 802-1X
    edit "<policy-name>"
        set security-mode 802.1X-mac-based
        set user-group "<radius-user-group>"
        set mac-auth-bypass enable
        set guest-vlan enable
        set guest-vlan-id "<guest-vlan-interface>"
        set guest-auth-delay 30
        set auth-fail-vlan enable
        set auth-fail-vlan-id "<auth-fail-vlan-interface>"
    next
end
```

### Apply the policy to a port

```
config switch-controller managed-switch
    edit "<switch-id>"
        config ports
            edit "<port>"
                set port-security-policy "<policy-name>"
            next
        end
    next
end
```

### Global 802.1X timers

reauth-period is in minutes (0 disables reauthentication); tx-period is in seconds. link-down-auth set-unauth drops the session when the link goes down.

```
config switch-controller 802-1X-settings
    set link-down-auth set-unauth
    set reauth-period 60
    set max-reauth-attempt 3
    set tx-period 30
end
```

### Allow RADIUS from the switches to the server

The switches send RADIUS from the FortiLink interface, and nothing passes without a firewall policy.

```
config firewall policy
    edit 0
        set name "FortiSwitch-RADIUS"
        set srcintf "<fortilink-interface>"
        set dstintf "<interface-toward-radius>"
        set srcaddr "all"
        set dstaddr "<radius-server-address-object>"
        set action accept
        set schedule "always"
        set service "RADIUS"
    next
end
```
