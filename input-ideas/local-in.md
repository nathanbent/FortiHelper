# Local-in configs

```
config firewall local-in-policy
    edit 101
        set intf "virtual-wan-link"
        set srcaddr "all"
        set dstaddr "all"
        set service "BGP"
        set schedule "always"
    next
    edit 102
        set intf "virtual-wan-link"
        set srcaddr "Untrusted GeoIP Regions"
        set dstaddr "all"
        set service "IKE"
        set schedule "always"
    next
end
```