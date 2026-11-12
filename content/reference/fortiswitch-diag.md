---
id: fortiswitch-diag
title: FortiSwitch diagnostics
topic: fortiswitch
kind: diagnostics
order: 60
---

`diag switch-controller mac-cache show` - Shows the MAC addresses on connected FortiSwitches

`diagnose switch-controller trigger config-sync <FortiSwitch_serial_number>` - Resyncs the complete FortiSwitch config

`get switch-controller managed-switch status` - State and firmware of each managed switch

`execute switch-controller get-conn-status` - Connection state of every managed switch

`diagnose switch-controller switch-info stp <FortiSwitch_serial_number> <instance>` - Spanning-tree state and root for an MST instance (0 = common tree)

`diagnose switch-controller switch-info bpdu-guard-status <FortiSwitch_serial_number>` - Ports shut down by BPDU guard
