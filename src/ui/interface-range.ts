import type { Tool } from '../types';
import { el, outputPane, selectField, setShown } from './components';
import {
  TARGET_LABELS,
  generateInterfaceRange,
  type RangeTarget,
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
    rangePanel.append(
      rangeInput,
      el(
        'p',
        'ref-note',
        'Ranges like port1-port8 or port1-8, separated by commas, spaces, or new lines. Single names such as wan1 or x1 work too.',
      ),
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
    cmdPanel.append(
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
        setShown(switchField, target === 'managed-switch');
        regenerate();
      },
    );
    options.append(el('h2', undefined, 'Options'), targetField, switchField);
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
      const result = generateInterfaceRange(rangeText, commandsText, { target, switchIds });
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
