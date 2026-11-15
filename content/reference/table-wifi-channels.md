---
id: table-wifi-channels
title: 5 GHz channels and DFS
topic: fortiap
kind: table
order: 18
---

The usual 20 MHz channels. DFS channels share spectrum with radar: an AP has to listen before using one and must leave it if radar appears, so clients can be moved without warning. Which channels are allowed, and at what power, depends on the country set on the controller: check your regulator's list.

```table
36, 40, 44, 48 - UNII-1. No DFS
52, 56, 60, 64 - UNII-2A. DFS
100 to 144 - UNII-2C. DFS. 120 to 128 are weather-radar channels with a longer listen time in some regions
149 to 165 - UNII-3. No DFS in the US; restricted or lower power in parts of Europe
40 MHz pairs - 36+40, 44+48, 52+56, 60+64, 100+104 and so on, 149+153, 157+161
80 MHz blocks - 36 to 48, 52 to 64, 100 to 112, 116 to 128, 132 to 144, 149 to 161
2.4 GHz - Use channels 1, 6, and 11 only, at 20 MHz
```
