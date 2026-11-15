## Use it for
Naming, grouping and approving a batch of FortiSwitches and FortiAPs from their serial numbers, instead of authorizing each one by hand.

## Give it
A CSV or .xlsx file, a paste from a spreadsheet, or rows added by hand. Only the serial number is required; name, comments, FortiCloud key, type, group and profile are optional. Download CSV template gives a starter file. Columns are found from the header row and can be remapped.

## You get
`config switch-controller managed-switch` and `config wireless-controller wtp` entries plus group membership, cut into batches that each have their own Copy button. Group members are added with `append`, so a later batch does not undo an earlier one. The inventory CSV lists every device with its batch.

## Limits
Switch or AP is read from the serial's prefix unless a Type column says otherwise. Rename from serial number to name needs FortiOS 7.4 or later and applies to switches only: APs keep their serial as their ID.

The FortiCloud key is tracked in the table and the inventory, not configured, unless you put it in the comment.

## More
[Switch & AP Onboarding in the README]({repo}#tools)
