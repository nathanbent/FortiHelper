## Use it for
Naming, grouping and approving FortiSwitches and FortiAPs in bulk from their serial numbers.

## Give it
A CSV or .xlsx file, a paste from a spreadsheet, or rows added by hand. Only the serial number is required; the other columns are optional and can be remapped.

Paste the FortiGate's current config under Already on the FortiGate, and only what is missing or different is generated.

## You get
`managed-switch` and `wtp` entries plus group membership, cut into batches that each have their own Copy button. Group members are added with `append`, so a later batch does not undo an earlier one.

Copy check gives the `show` commands for a batch. Paste their output under Check what took, and the batch is marked confirmed or the devices that still differ are listed.

## Limits
Switch or AP is read from the serial's prefix unless a Type column says otherwise. Rename needs FortiOS 7.4 or later and applies to switches only.

Confirmed means the config matches the list, not that a device is online. A device the pasted output does not cover counts as not checked.

The FortiCloud key is tracked, not configured, unless you put it in the comment.

## More
[Switch & AP Onboarding in the README]({repo}#tools)
