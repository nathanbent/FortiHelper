---
id: fortiswitch-firmware
title: FortiSwitch: firmware from the FortiGate
topic: fortiswitch
kind: diagnostics
order: 60.8
runOn: fortigate
---

Draft, not verified on every release. Check the FortiLink compatibility matrix first: the FortiSwitchOS release has to be one your FortiOS release supports. Upgrade in batches, and never both halves of an MCLAG pair or both uplinks of a ring at once. Recent FortiOS can also download switch firmware from FortiGuard by itself; see firmware provisioning under config switch-controller global.

`get switch-controller managed-switch status` - Current firmware on every switch
`execute switch-controller switch-software upload tftp <image-file> <tftp-ip>` - Copy a FortiSwitch image onto the FortiGate
`execute switch-controller switch-software list-available` - Images held on the FortiGate, with the image id the next commands need
`execute switch-controller switch-software stage all <image-id>` - Send an image to every switch it fits. They run it after their next restart
`diagnose switch-controller switch-software upgrade <FortiSwitch_serial_number> <image-id>` - Upgrade one switch now. It reboots
`execute switch-controller get-upgrade-status` - Progress of each switch's upgrade
`execute switch-controller switch-software cancel all` - Cancel upgrades that are pending or stuck downloading [7.0+]
