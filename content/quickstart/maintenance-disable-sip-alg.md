---
category: maintenance
description: Turn off the SIP ALG and session helper, bypass RTP inspection, and clear existing SIP sessions so the change takes effect.
order: 10
---

# Disable SIP-ALG

## How to use
1. Read the generated config — this changes how the firewall treats all VoIP traffic
2. Paste the config sections, then run the session-clear commands
3. Re-register handsets and confirm audio both ways

The SIP ALG rewrites SIP payloads and is a common cause of one-way audio and
failed registrations behind a FortiGate. Turning it off is usually the fix when
the PBX or provider already handles NAT traversal.

The session clears at the end matter: existing SIP sessions keep using the old
helper until they are flushed, so the change looks like it did nothing without
them. `set default-voip-alg-mode kernel-helper-based` is a global setting and
affects every VDOM.

## Variables
- <sip-port> - SIP signalling port to clear sessions for - e.g. 5060

```
# 1. Disable the SIP session helper
config system session-helper
    delete 13
end

# 2. Move the default VoIP ALG mode off the proxy-based ALG
config system settings
    set default-voip-alg-mode kernel-helper-based
end

# 3. Bypass RTP inspection
config voip profile
    edit default
        config sip
            set rtp disable
        end
    next
end
```

Then clear existing SIP sessions so the change takes effect. These are
diagnostic commands, not config:

```
diagnose sys session filter clear
diagnose sys session filter dport <sip-port>
diagnose sys session clear

diagnose sys session filter clear
diagnose sys session filter sport <sip-port>
diagnose sys session clear
```
