## Use it for
Turning a domain list into static URL filter entries. To score pages on the words they contain instead, use [Content Filter](#/content-filter).

## Give it
One domain per line, such as `example.com` or `*.example.net`. Blank lines and `#` comments are ignored. With the type on auto, a domain containing `*` becomes a wildcard entry and the rest are simple entries.

Lists exported from another vendor's filter can carry a per-entry action suffix and that vendor's verbs: the helpers for these are under Advanced.

## You get
A complete `config webfilter urlfilter` list by default, or bare entry blocks, or numbered entries. The profile block that binds the list with `set urlfilter-table` is optional.

## Limits
One action applies to every entry unless the per-entry suffix helper is on. The list ID and name are yours to choose, and nothing checks whether that ID is already in use on your device: pasting a complete list with an existing ID changes that list.

Regex entries are passed through as written and are not validated.

## More
[Webfilter Generator in the README]({repo}#tools)
