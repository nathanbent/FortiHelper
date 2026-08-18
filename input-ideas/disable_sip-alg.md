# Disable SIP-ALG


```
# 1. Disable SIP session-helper
config system session-helper
    delete 13
    end
# 2. Change the default–voip–alg-mode to disable SIP-ALG.
config system settings
    set default-voip-alg-mode kernel-helper-based
    end
# 3. Configure RTP inspection bypass on a FortiGate
config voip profile
    edit default
        config sip
            set rtp disable
        end
    end
# 4. Clear SIP sessions
diagnose sys session filter clear
diagnose sys session filter dport 5060
diagnose sys session clear

diagnose sys session filter clear
diagnose sys session filter sport 5060
diagnose sys session clear
```