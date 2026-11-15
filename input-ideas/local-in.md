# Local-in configs

Both policies deny. That is the FortiOS default for a local-in policy; it is
written out here so the intent is visible. Policy 102 uses the address group
created in `Block-Policies-Move.md`.

```
config firewall local-in-policy
    edit 101
        set intf "virtual-wan-link"
        set srcaddr "all"
        set dstaddr "all"
        set service "BGP"
        set schedule "always"
        set action deny
    next
    edit 102
        set intf "virtual-wan-link"
        set srcaddr "Untrusted Geo-IP Regions"
        set dstaddr "all"
        set service "IKE"
        set schedule "always"
        set action deny
    next
end
```