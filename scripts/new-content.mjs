#!/usr/bin/env node
/**
 * Scaffold a new reference sheet or quickstart template.
 *
 *     npm run new-sheet <id> [topic] [kind]
 *     npm run new-template <id> [category]
 *
 * Writes a markdown file with the front matter filled in and the format
 * written out as comments, ready to edit. The file is valid as written, so
 * the build and the tests keep passing while you work on it.
 *
 * Topics, kinds and categories are read from the app's own source, so this
 * script never has a list of its own to fall out of date.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf-8');

/** The `value`s of an `export const NAME = [ { value: '...' }, ... ]` list. */
export function listValues(source, name) {
  const block = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\]`).exec(source);
  if (!block) throw new Error(`could not find ${name} in the source`);
  return [...block[1].matchAll(/value:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** `ipsec-status` -> `Ipsec status`: a starting title, meant to be edited. */
export function titleFromId(id) {
  const words = id.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Front matter `key: value` pairs of a markdown file, or {} without any. */
export function frontMatter(markdown) {
  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return {};
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  const meta = {};
  for (const line of lines.slice(1, end === -1 ? 1 : end)) {
    const at = line.indexOf(':');
    if (at !== -1 && !line.trimStart().startsWith('#')) {
      meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  }
  return meta;
}

/** One past the highest `order` already used in a group, or 10 for the first. */
export function nextOrder(orders) {
  const used = orders.filter(Number.isFinite);
  return used.length ? Math.floor(Math.max(...used)) + 1 : 10;
}

export function sheetScaffold({ id, title, topic, kind, order, topics, kinds }) {
  return `---
id: ${id}
title: ${title}
topic: ${topic}
kind: ${kind}
order: ${order}
# Optional lines. Remove the leading "# " to use one, or delete them.
# copyAll: true          numbered steps and a "Copy all" button, for a sequence
# runOn: fortigate       fortigate | fortiswitch | fortiap, shown as a badge
# since: 7.2             first FortiOS release this sheet applies to
# until: 7.6             first release it no longer applies to
#
# topic is one of: ${topics.join(', ')}
# kind is one of:  ${kinds.join(', ')}
#
# In the body, below the closing ---:
#   prose before the first command is the note under the title
#   \`command\` - description              a copyable row
#   > what to look for                   a "Look for" note for the command above
#   \`command\` - description [7.4+]       needs that release ([<7.4]: only before it)
#   <placeholder> in a command           becomes a fill-in field; label it in
#                                        content/reference-variables.md
#   ### Heading, then a fenced block     a config snippet, copied whole
---

Replace this with a sentence on when to use this sheet.

\`get system status\` - Replace this with your first command
`;
}

export function templateScaffold({ title, category, order, categories }) {
  return `---
category: ${category}
description: One line for the card on the Templates index.
order: ${order}
# category is one of: ${categories.join(', ')}
---

# ${title}

## How to use
1. Fill in the fields
2. Paste the generated config

## Variables
- <site-name> - Site name - e.g. HQ

\`\`\`
config system global
    set hostname "<site-name>-FGT"
end
\`\`\`
`;
}

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function fail(message) {
  console.error(`new-content: ${message}`);
  process.exit(1);
}

function pick(value, valid, what, fallback) {
  const chosen = value ?? fallback;
  if (!valid.includes(chosen)) fail(`unknown ${what} "${chosen}". Valid: ${valid.join(', ')}`);
  return chosen;
}

function existing(dir) {
  return readdirSync(new URL(dir, ROOT))
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, meta: frontMatter(read(`${dir}${name}`)) }));
}

function main([what, id, first, second]) {
  if (what !== 'sheet' && what !== 'template') fail('first argument must be "sheet" or "template"');
  const usage =
    what === 'sheet'
      ? 'npm run new-sheet <id> [topic] [kind]'
      : 'npm run new-template <id> [category]';
  if (!id) fail(`missing id. Usage: ${usage}`);
  if (!ID_RE.test(id)) fail(`id "${id}" must be lowercase letters, digits and hyphens`);

  const dir = what === 'sheet' ? 'content/reference/' : 'content/quickstart/';
  const files = existing(dir);
  const file = new URL(`${dir}${id}.md`, ROOT);
  if (existsSync(file)) fail(`${dir}${id}.md already exists`);

  let text;
  if (what === 'sheet') {
    const types = read('src/lib/reference/types.ts');
    const topics = listValues(types, 'REFERENCE_TOPICS');
    const kinds = listValues(types, 'REFERENCE_KINDS');
    const topic = pick(first, topics, 'topic', 'general');
    const kind = pick(second, kinds, 'kind', 'diagnostics');
    const clash = files.find((f) => f.meta.id === id);
    if (clash) fail(`id "${id}" is already used by ${dir}${clash.name}`);
    const order = nextOrder(
      files.filter((f) => f.meta.topic === topic).map((f) => Number(f.meta.order)),
    );
    text = sheetScaffold({ id, title: titleFromId(id), topic, kind, order, topics, kinds });
  } else {
    const categories = listValues(read('src/lib/quickstart/index.ts'), 'TEMPLATE_CATEGORIES');
    const category = pick(first, categories, 'category', 'other');
    const order = nextOrder(
      files.filter((f) => (f.meta.category ?? 'other') === category).map((f) => Number(f.meta.order)),
    );
    text = templateScaffold({ title: titleFromId(id), category, order, categories });
  }

  writeFileSync(file, text);
  console.log(`Created ${dir}${id}.md`);
  console.log('Edit it, then run "npm run dev" to see it, or "npm test" to check it.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
