# Changelog

What changed in FortiHelper, newest first. The About page in the app shows
this file, so keep the shape: a `## YYYY-MM-DD` heading per day, then one
`- ` bullet per change, in plain text.

## 2026-11-15

- About page with version and build info, and this changelog, linked from the nav and the footer.
- Reference: FortiLink bring-up, switch port, and FortiAP sheets, plus table blocks for port, PoE, and Wi-Fi channel lookups.
- Reference: traffic, routing, SD-WAN, and HA sheets.
- Reference: authentication, SSL VPN, ZTNA, and system sheets, plus a FortiSwitch and FortiAP names and IDs sheet.
- Onboarding: compares your list against the FortiGate's current config, and switch naming follows the FortiOS version, renaming by default on 7.4 and later.
- Reference: fill-in variable fields with a shared variables bar, so a value typed once lands in every command that uses it.
- Reference: search highlighting, numbered steps, version and run-on badges, favourites, recents, keyboard navigation, topic grouping, and deep links to a sheet.
- Reference sheets and templates are published as JSON next to the site for reuse elsewhere.
- New look: brand colours and fonts, with fonts preloaded so text does not reflow.

## 2026-11-12

- New tool: Switch & AP Onboarding. Turns a CSV, XLSX, or pasted list of FortiSwitch and FortiAP serials into config that names, groups, and approves them.
- Onboarding: downloadable CSV template, and an opt-in rename of switches from serial to name.
- Reference: FortiSwitch sheets for STP, IGMP, port protection, trunks, 802.1X, QoS, LLDP, and PoE.

## 2026-11-05

- Object Helper: messy input is normalized, with suggested fixes shown before anything is changed.
- Object Helper: URL lists that read as pairs are caught, and names built from URLs are cleaned up.

## 2026-09-18

- Object Helper: spreadsheet-paste mode for input copied out of Excel, including SonicWall address-object exports.
- Object Helper: object names FortiOS rejects are sanitized.
- Object Helper: 0.0.0.0/32 placeholder objects are flagged and skipped by default.

## 2026-08-18

- Renamed from FortiNate to FortiHelper.
- Webfilter Generator: opt-in migration helpers.
- Templates moved to the end of the nav, and the public build trimmed to generic examples.

## 2026-08-17

- First version: Object Helper and Webfilter Generator, ported from the original Python scripts.
