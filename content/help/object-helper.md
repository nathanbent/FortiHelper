## Use it for
Turning a list of hosts and networks into `config firewall address` objects and an address group. To change objects that already exist on a device, use [Forti Edit](#/forti-edit).

## Give it
One entry per line: an FQDN, an IP, a CIDR or an IP range, such as `www.example.com` or `198.51.100.0/24`. The input mode also accepts name and value pairs, delimited lines, or cells pasted straight from a spreadsheet, where the columns are detected and can be remapped.

## You get
CLI to paste into a console session, with options for name prefixes, comments, colors and interfaces. Anything the tool corrected on its own is listed under Auto-corrected, and fixes it could make are offered under Suggested fixes.

## Limits
IPv4 only: an IPv6 entry is reported and left out. Nothing checks your device: pasting changes an existing object with the same name and replaces the members of an existing group.

Resolved-IP objects are off by default. Turning them on sends each FQDN to a public DNS-over-HTTPS resolver (Cloudflare or Google), and the addresses are a snapshot from the moment of the lookup.

## More
[Object Helper in the README]({repo}#tools)
