import type { Tool } from '../types';
import { checkbox, el, outputPane, selectField, setShown } from './components';
import {
  TARGET_LABELS,
  generateInterfaceRange,
  type Parity,
  type RangeTarget,
  type WrapMode,
} from '../lib/interface-range';

const RANGE_PLACEHOLDER = 'port1-port8, port10-11, x1';

/** Example commands per target: what a first-time user would most likely type. */
const COMMAND_PLACEHOLDERS: Record<RangeTarget, string> = {
  fortigate: ['# One command per line, as typed inside edit "port1"', 'set status down', 'set description "Unused"'].join(
    '\n',
  ),
  'managed-switch': [
    '# One command per line, as typed inside edit "port1"',
    'set vlan "vlan10"',
    'set allowed-vlans "vlan20" "vlan30"',
    'set description "Desk {n}"',
  ].join('\n'),
  fortiswitch: [
    '# One command per line, as typed inside edit "port1"',
    'set native-vlan 10',
    'set allowed-vlans 20,30',
    'set description "Desk {n}"',
  ].join('\n'),
};

/** One-click command lines per target: the everyday port changes. */
const SNIPPETS: Record<RangeTarget, { label: string; line: string }[]> = {
  fortigate: [
    { label: 'Shut down', line: 'set status down' },
    { label: 'Bring up', line: 'set status up' },
    { label: 'Description', line: 'set description "{port}"' },
    { label: 'Alias', line: 'set alias "<alias>"' },
    { label: 'Role LAN', line: 'set role lan' },
    { label: 'Allow ping', line: 'set allowaccess ping' },
  ],
  'managed-switch': [
    { label: 'Shut down', line: 'set status down' },
    { label: 'Bring up', line: 'set status up' },
    { label: 'Description', line: 'set description "{port}"' },
    { label: 'Native VLAN', line: 'set vlan "<vlan>"' },
    { label: 'Allowed VLANs', line: 'set allowed-vlans "<vlan>" "<vlan>"' },
    { label: 'PoE off', line: 'set poe-status disable' },
    { label: 'Edge port', line: 'set edge-port enable' },
  ],
  fortiswitch: [
    { label: 'Description', line: 'set description "{port}"' },
    { label: 'Native VLAN', line: 'set native-vlan <vlan id>' },
    { label: 'Allowed VLANs', line: 'set allowed-vlans <vlan id>,<vlan id>' },
  ],
};

/** Output shapes per target, outermost first. */
function wrapOptions(target: RangeTarget): { value: WrapMode; label: string }[] {
  if (target === 'managed-switch') {
    return [
      { value: 'full', label: 'full: from config switch-controller managed-switch' },
      { value: 'ports', label: 'config ports only (already in edit <switch>)' },
      { value: 'edits', label: 'edit blocks only (already in config ports)' },
    ];
  }
  const section = target === 'fortigate' ? 'config system interface' : 'config switch interface';
  return [
    { value: 'full', label: `full: from ${section}` },
    { value: 'edits', label: `edit blocks only (already in ${section})` },
  ];
}

/** How long the expansion preview gets before it is cut short. */
const PREVIEW_MAX = 40;

export const interfaceRangeTool: Tool = {
  id: 'interface-range',
  title: 'Interface Range',
  description:
    'The FortiOS answer to Cisco’s interface range: list interfaces such as port1-port8,port10-11, ' +
    'type the commands once, and get them repeated for every interface.',
  mount(container) {
    let target: RangeTarget = 'managed-switch';
    let rangeText = '';
    let commandsText = '';
    let switchIds = '';
    let wrap: WrapMode = 'full';
    let only: Parity = 'all';
    let sort = false;

    const layout = el('div', 'tool-layout');
    const left = el('div');

    // --- Interfaces ---
    const rangePanel = el('section', 'panel');
    rangePanel.append(el('h2', undefined, 'Interfaces'));
    const rangeInput = el('textarea', 'tool-input');
    rangeInput.placeholder = RANGE_PLACEHOLDER;
    rangeInput.spellcheck = false;
    rangeInput.rows = 3;
    rangeInput.style.minHeight = '4.5rem';
    rangeInput.addEventListener('input', () => {
      rangeText = rangeInput.value;
      regenerate();
    });
    const preview = el('p', 'ref-note');

    // Quick range: prefix, from, to, which -> appends `port1-24:odd`.
    const builder = el('div', 'ir-builder');
    const mk = (label: string, input: HTMLInputElement | HTMLSelectElement) => {
      const f = el('label', 'ir-builder-field');
      f.append(el('span', undefined, label), input);
      return f;
    };
    const bPrefix = el('input');
    bPrefix.type = 'text';
    bPrefix.value = 'port';
    bPrefix.size = 6;
    const bFrom = el('input');
    bFrom.type = 'number';
    bFrom.min = '0';
    bFrom.value = '1';
    const bTo = el('input');
    bTo.type = 'number';
    bTo.min = '0';
    bTo.value = '24';
    const bWhich = el('select');
    for (const [v, l] of [
      ['', 'all'],
      [':odd', 'odd'],
      [':even', 'even'],
      [':step2', 'every 2nd'],
      [':step4', 'every 4th'],
    ]) {
      const o = el('option', undefined, l);
      o.value = v;
      bWhich.append(o);
    }
    const bAdd = el('button', 'btn', 'Add');
    const bExclude = el('button', 'btn', 'Exclude');
    const appendItem = (exclude: boolean) => {
      const prefix = bPrefix.value.trim();
      const from = bFrom.value.trim();
      const to = bTo.value.trim();
      if (from === '') return;
      const item =
        (exclude ? '!' : '') + prefix + from + (to !== '' && to !== from ? `-${to}` : '') + bWhich.value;
      const cur = rangeInput.value.trim();
      rangeInput.value = cur ? `${cur.replace(/,\s*$/, '')}, ${item}` : item;
      rangeText = rangeInput.value;
      regenerate();
    };
    bAdd.addEventListener('click', () => appendItem(false));
    bExclude.addEventListener('click', () => appendItem(true));
    builder.append(
      mk('Prefix', bPrefix),
      mk('From', bFrom),
      mk('To', bTo),
      mk('Which', bWhich),
      bAdd,
      bExclude,
    );

    const filters = el('div', 'ir-filters');
    filters.append(
      selectField(
        'Only',
        [
          { value: 'all', label: 'all listed interfaces' },
          { value: 'odd', label: 'odd numbers' },
          { value: 'even', label: 'even numbers' },
        ],
        only,
        (v) => {
          only = v as Parity;
          regenerate();
        },
      ),
      checkbox('Sort by number', sort, (v) => {
        sort = v;
        regenerate();
      }, 'instead of the order written'),
    );

    rangePanel.append(
      rangeInput,
      el(
        'p',
        'ref-note',
        'Ranges like port1-port8 or port1-8, separated by commas, spaces, or new lines; single names such as wan1 work too. ' +
          'End an item with :odd, :even, or :step2 to thin it out, and start one with ! to leave it out: port1-24:odd, !port5.',
      ),
      builder,
      filters,
      preview,
    );

    // --- Commands ---
    const cmdPanel = el('section', 'panel');
    cmdPanel.append(el('h2', undefined, 'Commands'));
    const cmdInput = el('textarea', 'tool-input');
    cmdInput.spellcheck = false;
    cmdInput.addEventListener('input', () => {
      commandsText = cmdInput.value;
      regenerate();
    });
    const snippetRow = el('div', 'ir-snippets');
    const renderSnippets = () => {
      snippetRow.replaceChildren(el('span', 'hint', 'Insert:'));
      for (const sn of SNIPPETS[target]) {
        const b = el('button', 'btn', sn.label);
        b.title = sn.line;
        b.addEventListener('click', () => {
          const cur = cmdInput.value.replace(/\s+$/, '');
          cmdInput.value = cur ? `${cur}\n${sn.line}` : sn.line;
          commandsText = cmdInput.value;
          cmdInput.focus();
          regenerate();
        });
        snippetRow.append(b);
      }
    };
    renderSnippets();
    cmdPanel.append(
      snippetRow,
      cmdInput,
      el(
        'p',
        'ref-note',
        'Type them as you would inside one interface’s edit block; nested config … end blocks are fine. ' +
          '{port} is replaced with the interface name, {n} with its number, and {i} with its position in the list.',
      ),
    );
    left.append(rangePanel, cmdPanel);

    // --- Options + output ---
    const options = el('section', 'panel');
    const switchField = el('div', 'field');
    const switchLabel = el('label', undefined, 'Switch ID');
    const switchInput = el('input');
    switchInput.type = 'text';
    switchInput.placeholder = 'S248EPTF00000000';
    switchInput.addEventListener('input', () => {
      switchIds = switchInput.value;
      regenerate();
    });
    switchField.append(
      switchLabel,
      switchInput,
      el(
        'span',
        'hint',
        'the serial, or the name once renamed on FortiOS 7.4 and later; list several to apply the same change to each switch',
      ),
    );

    const targetField = selectField(
      'Interfaces on',
      (Object.keys(TARGET_LABELS) as RangeTarget[]).map((v) => ({ value: v, label: TARGET_LABELS[v] })),
      target,
      (v) => {
        target = v as RangeTarget;
        cmdInput.placeholder = COMMAND_PLACEHOLDERS[target];
        if (wrap === 'ports' && target !== 'managed-switch') wrap = 'full';
        renderSnippets();
        renderWrap();
        regenerate();
      },
    );
    const wrapSlot = el('div');
    function renderWrap() {
      wrapSlot.replaceChildren(
        selectField(
          'Output',
          wrapOptions(target),
          wrap,
          (v) => {
            wrap = v as WrapMode;
            setShown(switchField, target === 'managed-switch' && wrap === 'full');
            regenerate();
          },
          wrap === 'full' ? undefined : 'paste at the matching prompt: nothing above it is included',
        ),
      );
      setShown(switchField, target === 'managed-switch' && wrap === 'full');
    }
    renderWrap();
    options.append(el('h2', undefined, 'Options'), targetField, wrapSlot, switchField);
    cmdInput.placeholder = COMMAND_PLACEHOLDERS[target];

    const output = outputPane(
      'interface-range.txt',
      'Every listed interface gets every command. A name the device does not have makes FortiOS try to create it, so check the names before pasting.',
    );

    const right = el('div');
    right.append(options, output.root);
    layout.append(left, right);
    container.append(layout);

    function regenerate() {
      const result = generateInterfaceRange(rangeText, commandsText, { target, switchIds, wrap, only, sort });
      const { names, stats } = result;

      if (names.length) {
        const shown = names.slice(0, PREVIEW_MAX).join(', ');
        const more = names.length > PREVIEW_MAX ? `, … (${names.length - PREVIEW_MAX} more)` : '';
        preview.textContent = `${names.length} interface${names.length === 1 ? '' : 's'}: ${shown}${more}`;
      } else {
        preview.textContent = '';
      }
      setShown(preview, names.length > 0);

      const parts = [
        `${stats.interfaces} interface${stats.interfaces === 1 ? '' : 's'}`,
        `${stats.commands} command line${stats.commands === 1 ? '' : 's'} each`,
      ];
      if (stats.switches > 1) parts.push(`${stats.switches} switches`);
      output.update(result.output, parts.join(' · '), result.warnings);
    }

    regenerate();
  },
};
