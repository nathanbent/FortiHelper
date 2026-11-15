## Use it for
Turning a banned-word list into `config webfilter content` entries. To block by domain instead, use the [Webfilter Generator](#/webfilter).

## Give it
One word or phrase per line, such as `gambling` or `"free money"`. Quote a phrase to count it only when it appears exactly as written. Blank lines and `#` comments are ignored.

## You get
The content filter table, with a pattern type, score, language and action applied to every entry. The profile block that binds it with `set bword-table` and `set bword-threshold` is optional. The stats line says how many matches it takes to block a page.

## Limits
FortiOS adds up the score of every pattern found on a page and blocks once the total reaches the threshold, so a low score with a high threshold may never block.

`*` means different things in the two pattern types: any characters in a wildcard, a repeat of the previous character in a regular expression. Patterns are not validated.

## More
[Content Filter in the README]({repo}#tools)
