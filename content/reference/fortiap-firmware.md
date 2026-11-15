---
id: fortiap-firmware
title: FortiAP: firmware from the FortiGate
topic: fortiap
kind: diagnostics
order: 15
runOn: fortigate
---

Draft, not verified on every release. The FortiGate holds one image per AP model. An AP takes the image for its model the next time it restarts, so upload first, then reset the APs in batches.

`diagnose wireless-controller wlac -c wtp` - Current firmware on every AP
`execute wireless-controller upload-wtp-image tftp <image-file> <tftp-ip>` - Copy a FortiAP image onto the FortiGate
`execute wireless-controller list-wtp-image` - Images held on the FortiGate
`execute wireless-controller reset-wtp <ap-serial>` - Restart one AP so it takes the new image. Its clients are disconnected
`execute wireless-controller reset-wtp all` - Restart every AP at once. Use a serial number or an AP group to go in batches
`execute wireless-controller delete-wtp-image all` - Remove the stored images afterwards
