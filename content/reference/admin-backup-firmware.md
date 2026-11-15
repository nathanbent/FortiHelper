---
id: admin-backup-firmware
title: Backup, restore, and firmware
topic: general
kind: diagnostics
order: 74
---

Draft, not verified on every release. Take a backup before every upgrade, and follow the upgrade path Fortinet publishes for your model: skipping steps loses config. Restoring a config or an image reboots the unit.

`execute backup config tftp <config-file> <tftp-ip>` - Save the configuration to a TFTP server
`execute restore config tftp <config-file> <tftp-ip>` - Load a configuration from a TFTP server. The unit reboots
`get system status` - The firmware version running now
`diagnose sys flash list` - Firmware held in each flash partition, and which one is active
`execute restore image tftp <image-file> <tftp-ip>` - Install firmware from a TFTP server. The unit reboots
`diagnose debug config-error-log read` - Config lines the new firmware rejected at boot. Read this after every upgrade
> Empty is what you want. Each line listed is a setting that did not carry over and needs redoing by hand.
`execute set-next-reboot secondary` - Boot the other partition next time, to go back to the previous firmware
