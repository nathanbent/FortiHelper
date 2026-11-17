## Use it for
Applying the same commands to many interfaces at once, like `interface range` on a Cisco switch. Works for FortiGate interfaces, FortiLink-managed FortiSwitch ports, and a standalone FortiSwitch. To change entries that match a condition in pasted config, use [Forti Edit](#/forti-edit).

## Give it
Interfaces as ranges and names, such as `port1-port8, port10-11, x1`. Then the commands, one per line, as typed inside one interface's `edit` block, such as `set vlan "vlan10"`. `{port}`, `{n}` and `{i}` fill in the name, its number, and its place in the list.

## You get
The commands repeated in an `edit` block per interface, wrapped in the right `config` section. For managed switches, one block per switch ID.

## Limits
Commands are not checked against the device: a setting that does not exist on that model or version fails when pasted. Cisco syntax is flagged with the FortiOS equivalent where there is a common one, but not translated.

On a FortiGate with VDOMs, enter the VDOM before pasting.

## More
[Interface Range in the README]({repo}#tools)
