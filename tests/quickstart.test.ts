import { describe, expect, it } from 'vitest';
import { parseQuickstart, fillQuickstart, TEMPLATE_CATEGORIES } from '../src/lib/quickstart';
import { loadTemplates } from '../src/lib/quickstart/templates';

const SAMPLE = `# Test Quickstart

## How to use
1. Copy this file

## Variables
- <site-short-name> - Short site name - e.g. TI
- <WAN-port-name> - WAN port name - e.g. wan1
- <no-example> - A field with no example

## Context
Some prose.

\`\`\`
config system global
    set hostname "<site-short-name>-FGT"
end

config system interface
    edit "<WAN-port-name>"
        set alias "<site-short-name>-WAN"
    next
end
\`\`\`
`;

describe('parseQuickstart', () => {
  const template = parseQuickstart(SAMPLE);

  it('takes the title from the first heading', () => {
    expect(template.title).toBe('Test Quickstart');
  });

  it('reads the Variables list in order, with labels and examples', () => {
    expect(template.variables.map((v) => v.name)).toEqual([
      '<site-short-name>',
      '<WAN-port-name>',
      '<no-example>',
    ]);
    expect(template.variables[0]).toMatchObject({
      description: 'Short site name',
      example: 'TI',
      undocumented: false,
    });
    expect(template.variables[1]).toMatchObject({ description: 'WAN port name', example: 'wan1' });
  });

  it('handles a variable documented without an example', () => {
    const v = template.variables.find((x) => x.name === '<no-example>')!;
    expect(v.description).toBe('A field with no example');
    expect(v.example).toBe('');
  });

  it('takes the body from the fenced block, without the fences or prose', () => {
    expect(template.body.startsWith('config system global')).toBe(true);
    expect(template.body.endsWith('end')).toBe(true);
    expect(template.body).not.toContain('```');
    expect(template.body).not.toContain('How to use');
  });

  it('counts how many times each placeholder is used', () => {
    expect(template.variables.find((v) => v.name === '<site-short-name>')!.occurrences).toBe(2);
    expect(template.variables.find((v) => v.name === '<WAN-port-name>')!.occurrences).toBe(1);
  });

  it('warns about a documented variable the body never uses', () => {
    expect(template.warnings.map((w) => w.message)).toContain(
      '<no-example> is documented but never used in the template body',
    );
  });

  it('adds undocumented placeholders so the form still covers them', () => {
    const t = parseQuickstart(
      '# T\n\n## Variables\n- <site> - First\n\n```\nset a <site>\nset b <extra>\n```',
    );
    const b = t.variables.find((v) => v.name === '<extra>')!;
    expect(b).toMatchObject({ undocumented: true, occurrences: 1 });
    // A readable fallback label, since there is no description to use.
    expect(b.description).toBe('extra');
    expect(t.warnings.some((w) => w.message.includes('not listed under'))).toBe(true);
  });

  it('joins every fenced block, so a template can have sections', () => {
    const t = parseQuickstart(
      '# T\n\n## Variables\n- <a> - A\n- <b> - B\n\n```\nconfig one\n<a>\nend\n```\n\nProse between blocks is not config.\n\n```\ndiagnose two <b>\n```',
    );
    expect(t.body).toBe('config one\n<a>\nend\n\ndiagnose two <b>');
    expect(t.body).not.toContain('Prose between blocks');
    // Both blocks count, so a variable used only in the second is not "unused".
    expect(t.variables.find((v) => v.name === '<b>')!.occurrences).toBe(1);
    expect(t.warnings).toEqual([]);
  });

  it('falls back to the whole document when there is no fenced block', () => {
    const t = parseQuickstart('# T\n\n## Variables\n- <a> - First\n\nset hostname <a>');
    expect(t.body).toContain('set hostname <a>');
    expect(t.warnings.some((w) => w.message.includes('No fenced code block'))).toBe(true);
  });

  it('derives fields from the body when there is no Variables list', () => {
    const t = parseQuickstart('# T\n\n```\nset hostname <site>\n```');
    expect(t.variables.map((v) => v.name)).toEqual(['<site>']);
    expect(t.warnings.some((w) => w.message.includes('No "## Variables" list'))).toBe(true);
  });

  it('ignores angle brackets that are not placeholder-shaped', () => {
    const t = parseQuickstart('# T\n\n```\nset x <1234>\nset y < spaced >\nset z <ok-name>\n```');
    expect(t.variables.map((v) => v.name)).toEqual(['<ok-name>']);
  });

  it('does not mistake HTML in the body for undocumented placeholders', () => {
    // The bundled template's pre-login banner is HTML.
    const t = parseQuickstart(
      '# T\n\n## Variables\n- <site-name> - Site\n\n```\nset pre-login-banner "<p><b><site-name></b></p><ul><li>x</li></ul>"\n```',
    );
    expect(t.variables.map((v) => v.name)).toEqual(['<site-name>']);
  });

  it('still honours an odd-shaped placeholder once it is documented', () => {
    const t = parseQuickstart('# T\n\n## Variables\n- <site> - Site name\n\n```\nset x <site>\n```');
    expect(t.variables.map((v) => v.name)).toEqual(['<site>']);
    expect(t.variables[0].undocumented).toBe(false);
  });

  it('supports en dash and em dash separators in the Variables list', () => {
    const t = parseQuickstart('# T\n\n## Variables\n- <a> — Label — e.g. sample\n\n```\n<a>\n```');
    expect(t.variables[0]).toMatchObject({ description: 'Label', example: 'sample' });
  });

  it('stops reading variables at the next heading', () => {
    const t = parseQuickstart(
      '# T\n\n## Variables\n- <site> - First\n\n## Other\n- <extra> - Not a variable\n\n```\n<site> <extra>\n```',
    );
    expect(t.variables.find((v) => v.name === '<extra>')!.undocumented).toBe(true);
  });
});

describe('parseQuickstart front matter', () => {
  const withMeta = (...meta: string[]) =>
    ['---', ...meta, '---', '', '# Heading title', '', '## Variables', '- <a> - A', '', '```', '<a>', '```'].join('\n');

  it('is optional — a template without it parses as before', () => {
    const t = parseQuickstart(SAMPLE);
    expect(t.category).toBe('other');
    expect(t.description).toBe('');
    expect(t.order).toBe(100);
    expect(t.title).toBe('Test Quickstart');
    expect(t.warnings.every((w) => !w.message.includes('category'))).toBe(true);
  });

  it('reads category, description, and order', () => {
    const t = parseQuickstart(
      withMeta('category: vpn', 'description: A tunnel', 'order: 5'),
    );
    expect(t).toMatchObject({ category: 'vpn', description: 'A tunnel', order: 5 });
  });

  it('lets front matter override the heading title', () => {
    expect(parseQuickstart(withMeta('title: From front matter')).title).toBe('From front matter');
    expect(parseQuickstart(withMeta('category: vpn')).title).toBe('Heading title');
  });

  it('falls back to Other on an unknown category, and says so', () => {
    const t = parseQuickstart(withMeta('category: nonsense'));
    expect(t.category).toBe('other');
    expect(t.warnings.some((w) => w.message.includes('Unknown category "nonsense"'))).toBe(true);
  });

  it('falls back to the default order when it is not a number', () => {
    expect(parseQuickstart(withMeta('order: soon')).order).toBe(100);
  });

  it('does not treat front matter as template content', () => {
    const t = parseQuickstart(withMeta('category: vpn'));
    expect(t.body).not.toContain('category');
    expect(t.body).toBe('<a>');
  });

  it('ignores an unclosed front matter block rather than eating the file', () => {
    const t = parseQuickstart('---\ncategory: vpn\n\n# Title\n\n```\n<a>\n```');
    expect(t.title).toBe('Title');
    expect(t.category).toBe('other');
  });
});

describe('fillQuickstart', () => {
  const template = parseQuickstart(SAMPLE);

  it('substitutes every occurrence of a value', () => {
    const { output, replaced } = fillQuickstart(template, {
      '<site-short-name>': 'TI',
      '<WAN-port-name>': 'wan1',
    });
    expect(output).toContain('set hostname "TI-FGT"');
    expect(output).toContain('edit "wan1"');
    expect(output).toContain('set alias "TI-WAN"');
    expect(replaced).toBe(3);
  });

  it('leaves unfilled placeholders in place and reports them', () => {
    const { output, missing } = fillQuickstart(template, { '<site-short-name>': 'TI' });
    expect(output).toContain('edit "<WAN-port-name>"');
    expect(missing).toEqual(['<WAN-port-name>']);
  });

  it('does not report a documented variable the body never uses', () => {
    const { missing } = fillQuickstart(template, {});
    expect(missing).not.toContain('<no-example>');
  });

  it('ignores blank and whitespace-only values, and trims real ones', () => {
    const { output, missing } = fillQuickstart(template, {
      '<site-short-name>': '   ',
      '<WAN-port-name>': '  wan2  ',
    });
    expect(missing).toContain('<site-short-name>');
    expect(output).toContain('edit "wan2"');
  });

  it('treats $ in a value literally, not as a replacement pattern', () => {
    const { output } = fillQuickstart(template, { '<site-short-name>': 'A$&B' });
    expect(output).toContain('set hostname "A$&B-FGT"');
  });
});

describe('bundled quickstart templates', () => {
  const templates = loadTemplates();

  it('finds the templates under content/quickstart/', () => {
    expect(templates.length).toBeGreaterThan(0);
    // The committed example ships in the public build; private templates are
    // gitignored, so a clean clone sees only this one.
    expect(templates.map((t) => t.id)).toContain('example-branch-office');
  });

  it('sorts by order within a category, not just by title', () => {
    const policy = templates.filter((t) => t.parsed.category === 'policy');
    const orders = policy.map((t) => t.parsed.order);
    expect(orders, 'policy templates are not in order').toEqual([...orders].sort((a, b) => a - b));
  });

  it('gives every template a known category', () => {
    const known = TEMPLATE_CATEGORIES.map((c) => c.value);
    for (const t of templates) {
      expect(known, `${t.id} has category ${t.parsed.category}`).toContain(t.parsed.category);
    }
  });

  it('gives every template a description for its card', () => {
    for (const t of templates) {
      expect(t.parsed.description.trim(), `${t.id} has no description`).not.toBe('');
    }
  });

  it('marks templates from private/ so they can sort first', () => {
    for (const t of templates) {
      expect(typeof t.private).toBe('boolean');
    }
    const publicOnly = templates.filter((t) => !t.private);
    expect(publicOnly.length).toBeGreaterThan(0);
  });

  // Runs over every template, so one added later is held to the same bar.
  it.each(templates.map((t) => [t.id, t.parsed] as const))('%s parses clean', (_id, template) => {
    expect(template.title.trim()).not.toBe('');
    expect(template.variables.length).toBeGreaterThan(0);
    expect(template.body).not.toContain('## Variables');

    // Every field is labelled, documented, and actually used.
    for (const v of template.variables) {
      expect(v.description.trim(), v.name).not.toBe('');
      expect(v.undocumented, `${v.name} is not in the Variables list`).toBe(false);
      expect(v.occurrences, `${v.name} is never used in the body`).toBeGreaterThan(0);
    }
    expect(template.warnings.map((w) => w.message)).toEqual([]);
  });

  it.each(templates.map((t) => [t.id, t.parsed] as const))(
    '%s fills with nothing left over',
    (_id, template) => {
      const values = Object.fromEntries(
        template.variables.map((v) => [v.name, v.example || 'VALUE']),
      );
      const { output, missing } = fillQuickstart(template, values);
      expect(missing).toEqual([]);
      for (const v of template.variables) expect(output).not.toContain(v.name);
    },
  );

  it('leaves HTML in a config value untouched', () => {
    // A pre-login banner is HTML; those tags are markup, not fields.
    const t = parseQuickstart(
      '# T\n\n## Variables\n- <site-name> - Site\n\n```\nset pre-login-banner "<p><b><site-name></b></p><ul><li>x</li></ul>"\n```',
    );
    const { output } = fillQuickstart(t, { '<site-name>': 'VALUE' });
    expect(output).toContain('<b>');
    expect(output).toContain('<li>');
    expect(output).toContain('VALUE');
  });
});
