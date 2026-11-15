## Use it for
Making the same change to many entries of one config section, for example adding an address group to every policy that uses a given interface. To create new address objects, use [Object Helper](#/object-helper).

## Give it
Pasted FortiOS config or `show` output containing the section, and the section's name, such as `firewall policy`.

Then one or more rules. A rule has match conditions on a field (contains, not-contains, equals, exists, absent), all of which must hold, and the changes to make to matching entries: append a value, remove a value, or set the field.

## You get
A match preview, so you can see which entries a rule hits before using the output. Delta mode emits only the changed entries; full mode rebuilds the whole section. Rules can be exported as JSON and imported later.

## Limits
One section at a time. The tool edits text, not a device: it does not know whether a value you append exists as an object, so check names before pasting.

Quoted values are read literally, with no escape handling, so a value containing an escaped quote is not parsed correctly.

## More
[Forti Edit in the README]({repo}#tools)
