import type { Tool, Warning } from '../types';
import { checkbox, el, numberField, selectField, setShown, textField } from './components';
import { columnLabel } from '../lib/object-helper';
import {
  DEVICE_FIELDS,
  detectDelimiter,
  detectDeviceColumns,
  generateOnboarding,
  inventoryCsv,
  joinBatches,
  parseDeviceTable,
  readDevices,
  readXlsx,
  rowsToTsv,
} from '../lib/device-onboarding';
import type {
  AuthAction,
  Batch,
  DeviceColumns,
  DeviceField,
  DeviceKind,
  OnboardingOptions,
  XlsxSheet,
} from '../lib/device-onboarding';

// Made-up serials in the real shape: 6-character model code + 10 more.
const PLACEHOLDER = [
  'Serial Number\tName\tComments\tFortiCloud Key',
  'S248EPTF00000001\tIDF1-SW1\tFirst floor IDF\tABCD-1234',
  'S124EPTF00000002\tIDF2-SW1\tSecond floor IDF\t',
  'FP231FTF00000003\tAP-Lobby\tLobby ceiling\tEFGH-5678',
  'FP231FTF00000004\tAP-Conf-A\tConference room A\t',
].join('\n');

const AUTH_OPTIONS: { value: AuthAction; label: string }[] = [
  { value: 'authorize', label: 'Approve (authorize)' },
  { value: 'reject', label: 'Reject (disable)' },
  { value: 'discovered', label: 'Back to waiting (discovered)' },
  { value: 'keep', label: 'Leave as it is' },
];

type Delimiter = 'auto' | '\t' | ',' | ';';
type ColumnChoice = 'auto' | 'none' | number;

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const deviceOnboardingTool: Tool = {
  id: 'onboarding',
  title: 'Switch & AP Onboarding',
  description:
    'Turn a list of FortiSwitch and FortiAP serial numbers into the FortiGate config that names, groups, and approves them — in batches you can paste one at a time.',
  mount(container) {
    // ---------- state ----------
    const opts: Required<OnboardingOptions> = {
      batchSize: 50,
      setName: true,
      setComment: true,
      bulkComment: '',
      keyInComment: false,
      memberMode: 'append',
      switchAuth: 'authorize',
      fortilink: 'fortilink',
      switchGroup: '',
      switchProfile: '',
      accessProfile: '',
      apAuth: 'authorize',
      apProfile: '',
      apGroup: '',
    };
    let text = '';
    let kindChoice: 'auto' | DeviceKind = 'auto';
    let delimiter: Delimiter = 'auto';
    let headerChoice: 'auto' | 'yes' | 'no' = 'auto';
    const columnChoice: Record<DeviceField, ColumnChoice> = {
      serial: 'auto',
      name: 'auto',
      comment: 'auto',
      cloudKey: 'auto',
      kind: 'auto',
      group: 'auto',
      profile: 'auto',
    };
    let sheets: XlsxSheet[] = [];
    /** Columns in effect for the current input; used by "Add device". */
    let columns: DeviceColumns = detectDeviceColumns({ rows: [], width: 0 });
    let tableWidth = 0;
    let batches: Batch[] = [];
    /** Outputs already copied, so a batch stays ticked while it is unchanged. */
    const copied = new Set<string>();

    const layout = el('div', 'tool-layout');
    const left = el('div');
    const right = el('div');
    layout.append(left, right);
    container.append(layout);

    // ---------- input ----------
    const inputPanel = el('section', 'panel');
    inputPanel.append(el('h2', undefined, 'Device list'));
    const textarea = el('textarea', 'tool-input');
    textarea.placeholder = PLACEHOLDER;
    textarea.spellcheck = false;
    textarea.wrap = 'off';
    textarea.addEventListener('input', () => {
      text = textarea.value;
      regenerate();
    });

    const setText = (value: string): void => {
      text = value;
      textarea.value = value;
      regenerate();
    };

    const fileRow = el('div', 'btn-row');
    const fileBtn = el('button', 'btn', 'Load CSV / XLSX…');
    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.tsv,.txt,.xlsx,text/csv,text/plain';
    fileInput.style.display = 'none';
    const clearBtn = el('button', 'btn', 'Clear');
    const fileNote = el('span', 'hint');
    fileRow.append(fileBtn, fileInput, clearBtn, fileNote);

    const sheetField = el('div', 'field');
    sheetField.append(el('label', undefined, 'Worksheet'));
    const sheetSelect = el('select');
    sheetField.append(sheetSelect);
    sheetField.hidden = true;
    sheetSelect.addEventListener('change', () => {
      const sheet = sheets[Number(sheetSelect.value)];
      if (sheet) setText(rowsToTsv(sheet.rows));
    });

    const fileError = el('div', 'warnings');
    fileError.hidden = true;

    fileBtn.addEventListener('click', () => fileInput.click());
    clearBtn.addEventListener('click', () => {
      sheets = [];
      sheetField.hidden = true;
      fileNote.textContent = '';
      fileError.hidden = true;
      setText('');
    });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      fileError.hidden = true;
      sheets = [];
      sheetField.hidden = true;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        // Zip files start "PK"; go by content so a misnamed file still loads.
        const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
        if (isZip) {
          sheets = await readXlsx(bytes);
          sheetSelect.replaceChildren(
            ...sheets.map((s, i) => {
              const o = el('option', undefined, `${s.name} (${plural(s.rows.length, 'row')})`);
              o.value = String(i);
              return o;
            }),
          );
          // Open on the first sheet that has anything in it.
          const first = Math.max(0, sheets.findIndex((s) => s.rows.length > 0));
          sheetSelect.value = String(first);
          sheetField.hidden = sheets.length < 2;
          setText(rowsToTsv(sheets[first].rows));
        } else if (/\.xls$/i.test(file.name) || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) {
          throw new Error('the old .xls format is not supported — save it as .xlsx or CSV');
        } else {
          setText(new TextDecoder().decode(bytes).replace(/^﻿/, ''));
        }
        fileNote.textContent = file.name;
      } catch (err) {
        fileNote.textContent = '';
        fileError.textContent = `Could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`;
        fileError.hidden = false;
      }
    });

    // --- manual entry ---
    const addBox = el('details', 'adv');
    addBox.append(el('summary', undefined, 'Add a device by hand'));
    const addFields: { field: DeviceField; input: HTMLInputElement }[] = [];
    const addRow = el('div', 'field-row');
    for (const [field, label, placeholder] of [
      ['serial', 'Serial number', 'S248EPTF00000001'],
      ['name', 'Name', 'IDF1-SW1'],
      ['comment', 'Comments', 'optional'],
      ['cloudKey', 'FortiCloud key', 'optional'],
    ] as [DeviceField, string, string][]) {
      const wrap = el('div', 'field');
      const input = el('input');
      input.type = 'text';
      input.placeholder = placeholder;
      input.spellcheck = false;
      wrap.append(el('label', undefined, label), input);
      addRow.append(wrap);
      addFields.push({ field, input });
    }
    const addBtnRow = el('div', 'btn-row');
    const addBtn = el('button', 'btn', 'Add to list');
    const addNote = el('span', 'hint');
    addBtnRow.append(addBtn, addNote);
    addBox.append(addRow, addBtnRow);

    const addDevice = (): void => {
      const values = new Map(addFields.map((f) => [f.field, f.input.value.trim()]));
      if (!values.get('serial')) {
        addNote.textContent = 'Enter a serial number.';
        return;
      }
      const empty = text.trim() === '';
      const delim = empty ? '\t' : delimiter === 'auto' ? detectDelimiter(text) : delimiter;
      const quote = (cell: string): string =>
        cell.includes(delim) || /["\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;

      let lines: string[];
      const dropped: string[] = [];
      if (empty) {
        // Start the list with a header, so the columns are unambiguous.
        lines = [
          ['Serial Number', 'Name', 'Comments', 'FortiCloud Key'].join(delim),
          addFields.map((f) => quote(values.get(f.field) ?? '')).join(delim),
        ];
      } else {
        const cells: string[] = new Array(Math.max(tableWidth, 1)).fill('');
        for (const f of addFields) {
          const value = values.get(f.field) ?? '';
          const col = columns[f.field];
          if (col !== null) cells[col] = quote(value);
          else if (value) dropped.push(DEVICE_FIELDS.find((d) => d.field === f.field)!.label);
        }
        lines = [text.replace(/[\r\n]+$/, ''), cells.join(delim).replace(/\t+$/, '')];
      }
      addNote.textContent = dropped.length
        ? `Added — but the list has no column for ${dropped.join(', ')}, so that was left out.`
        : `Added ${values.get('serial')}.`;
      for (const f of addFields) f.input.value = '';
      addFields[0].input.focus();
      setText(lines.join('\n') + '\n');
    };
    addBtn.addEventListener('click', addDevice);
    for (const f of addFields) {
      f.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addDevice();
      });
    }

    // --- column mapping ---
    const columnsBox = el('details', 'adv');
    const columnsSummary = el('summary', undefined, 'Columns');
    columnsBox.append(columnsSummary);
    columnsBox.append(
      selectField(
        'Device type',
        [
          { value: 'auto', label: 'Auto — from the Type column, then the serial number' },
          { value: 'switch', label: 'All FortiSwitch' },
          { value: 'ap', label: 'All FortiAP' },
        ],
        kindChoice,
        (v) => {
          kindChoice = v as typeof kindChoice;
          regenerate();
        },
      ),
      selectField(
        'Separator',
        [
          { value: 'auto', label: 'Auto-detect' },
          { value: '\t', label: 'Tab (spreadsheet paste)' },
          { value: ',', label: 'Comma (CSV)' },
          { value: ';', label: 'Semicolon' },
        ],
        delimiter,
        (v) => {
          delimiter = v as Delimiter;
          regenerate();
        },
      ),
      selectField(
        'Header row',
        [
          { value: 'auto', label: 'Auto-detect' },
          { value: 'yes', label: 'First row is headers' },
          { value: 'no', label: 'No header row' },
        ],
        headerChoice,
        (v) => {
          headerChoice = v as typeof headerChoice;
          regenerate();
        },
      ),
    );
    const columnSelects = new Map<DeviceField, HTMLSelectElement>();
    const columnGrid = el('div', 'field-row');
    for (const { field, label } of DEVICE_FIELDS) {
      const wrap = el('div', 'field');
      const select = el('select');
      select.addEventListener('change', () => {
        const v = select.value;
        columnChoice[field] = v === 'auto' || v === 'none' ? v : Number(v);
        regenerate();
      });
      wrap.append(el('label', undefined, label), select);
      columnGrid.append(wrap);
      columnSelects.set(field, select);
    }
    columnsBox.append(columnGrid);
    let columnKey = '';

    /** Refill the column dropdowns for the current table. */
    function rebuildColumnSelects(width: number, headers: string[] | null, detected: DeviceColumns): void {
      const key = `${width}|${(headers ?? []).join('\u0001')}|${DEVICE_FIELDS.map((f) => detected[f.field]).join(',')}`;
      if (key === columnKey) return;
      columnKey = key;
      for (const { field } of DEVICE_FIELDS) {
        const select = columnSelects.get(field)!;
        const auto = detected[field];
        const options: [string, string][] = [
          ['auto', auto === null ? 'Auto (not found)' : `Auto (column ${columnLabel(auto)})`],
        ];
        if (field !== 'serial') options.push(['none', '(none)']);
        for (let c = 0; c < width; c++) {
          const header = headers?.[c] ? ` — ${headers[c].slice(0, 24)}` : '';
          options.push([String(c), `Column ${columnLabel(c)}${header}`]);
        }
        select.replaceChildren(
          ...options.map(([value, label]) => {
            const o = el('option', undefined, label);
            o.value = value;
            return o;
          }),
        );
        const choice = columnChoice[field];
        if (typeof choice === 'number' && choice >= width) columnChoice[field] = 'auto';
        select.value = String(columnChoice[field]);
      }
    }

    inputPanel.append(textarea, fileRow, sheetField, fileError, addBox, columnsBox);

    // --- device preview ---
    const devicePanel = el('section', 'panel');
    const deviceHead = el('h2', undefined, 'Devices');
    const deviceWrap = el('div', 'device-table-wrap');
    devicePanel.append(deviceHead, deviceWrap);
    devicePanel.hidden = true;

    left.append(inputPanel, devicePanel);

    // ---------- options ----------
    const optionsPanel = el('section', 'panel');
    let advancedOpen = false;

    const text_ = <K extends keyof OnboardingOptions>(
      label: string,
      key: K & { [P in keyof OnboardingOptions]: OnboardingOptions[P] extends string | undefined ? P : never }[keyof OnboardingOptions],
      placeholder = '',
    ): HTMLDivElement =>
      textField(
        label,
        opts[key] as string,
        (v) => {
          (opts[key] as string) = v;
          regenerate();
        },
        placeholder,
      );

    function renderOptions(): void {
      const batchField = numberField(
        'Devices per batch',
        opts.batchSize,
        (v) => {
          opts.batchSize = Math.max(0, Math.floor(v));
          regenerate();
        },
        { min: 0, step: 1 },
      );
      batchField.append(el('span', 'hint', '0 puts everything in one block'));

      const apProfile = text_('FortiAP profile', 'apProfile', 'e.g. FAP{model}-default');
      apProfile.append(
        el('span', 'hint', '{model} is read from each serial: FP231F… gives FAP231F-default'),
      );
      const apGroup = text_('FortiAP group', 'apGroup', 'optional');
      apGroup.append(el('span', 'hint', 'one AP model per group'));

      const main: HTMLElement[] = [
        el('h2', undefined, 'Options'),
        batchField,
        el('div', 'subhead', 'FortiSwitch'),
        selectField('Approve / reject', AUTH_OPTIONS, opts.switchAuth, (v) => {
          opts.switchAuth = v as AuthAction;
          regenerate();
        }),
        text_('FortiLink interface', 'fortilink', 'fortilink'),
        text_('Switch group', 'switchGroup', 'optional'),
        el('div', 'subhead', 'FortiAP'),
        selectField('Approve / reject', AUTH_OPTIONS, opts.apAuth, (v) => {
          opts.apAuth = v as AuthAction;
          regenerate();
        }),
        apProfile,
        apGroup,
      ];

      const adv: HTMLElement[] = [
        checkbox('Set names', opts.setName, (v) => {
          opts.setName = v;
          regenerate();
        }, 'from the Name column'),
        checkbox('Set comments', opts.setComment, (v) => {
          opts.setComment = v;
          regenerate();
        }, 'switch description (63 characters) / AP location (35)'),
        text_('Comment for every device', 'bulkComment', 'added after each device’s own comment'),
        checkbox('Put the FortiCloud key in the comment', opts.keyInComment, (v) => {
          opts.keyInComment = v;
          regenerate();
        }, 'otherwise it is only kept in the inventory export'),
        selectField(
          'Group members',
          [
            { value: 'append', label: 'append — add to what the group already has' },
            { value: 'set', label: 'set — replace the group’s members' },
          ],
          opts.memberMode,
          (v) => {
            opts.memberMode = v as 'append' | 'set';
            regenerate();
          },
        ),
        text_('Switch profile', 'switchProfile', 'optional — set switch-profile'),
        text_('Switch access profile', 'accessProfile', 'optional — set access-profile'),
      ];
      const details = el('details', 'adv');
      details.open = advancedOpen;
      details.addEventListener('toggle', () => (advancedOpen = details.open));
      details.append(el('summary', undefined, 'Advanced'), ...adv);

      optionsPanel.replaceChildren(...main, details);
    }

    // ---------- output ----------
    const outputPanel = el('section', 'panel');
    outputPanel.append(el('h2', undefined, 'Generated config'));
    const outRow = el('div', 'btn-row');
    const downloadAllBtn = el('button', 'btn', 'Download all');
    const inventoryBtn = el('button', 'btn', 'Download inventory (CSV)');
    outRow.append(downloadAllBtn, inventoryBtn);
    const stats = el('div', 'stats');
    const batchList = el('div', 'batch-list');
    const empty = el(
      'div',
      'output-empty',
      'Paste a device list, load a CSV or XLSX file, or add devices by hand.',
    );
    const warnBox = el('div', 'warnings');
    const fixBox = el('details', 'fixes');
    outputPanel.append(outRow, stats, batchList, empty, warnBox, fixBox);

    downloadAllBtn.addEventListener('click', () =>
      download('switch-ap-onboarding.txt', joinBatches(batches), 'text/plain'),
    );
    inventoryBtn.addEventListener('click', () =>
      download('switch-ap-inventory.csv', inventoryCsv(batches), 'text/csv'),
    );

    right.append(optionsPanel, outputPanel);

    function renderBatches(): void {
      batchList.replaceChildren(
        ...batches.map((batch) => {
          const card = el('div', 'batch');
          const head = el('div', 'batch-head');
          const switches = batch.devices.filter((d) => d.kind === 'switch').length;
          const aps = batch.devices.length - switches;
          const parts: string[] = [];
          if (switches) parts.push(plural(switches, 'switch', 'switches'));
          if (aps) parts.push(plural(aps, 'AP'));
          const title = el('span', 'batch-title', `Batch ${batch.index} of ${batches.length}`);
          const meta = el('span', 'batch-meta', parts.join(', '));
          const done = el('span', 'copied', copied.has(batch.output) ? 'Copied ✓' : '');
          const copyBtn = el('button', 'btn', 'Copy');
          copyBtn.addEventListener('click', async () => {
            await navigator.clipboard.writeText(batch.output);
            copied.add(batch.output);
            done.textContent = 'Copied ✓';
            card.classList.add('done');
          });
          head.append(title, meta, done, copyBtn);
          card.classList.toggle('done', copied.has(batch.output));
          card.append(head, el('pre', 'output', batch.output));
          return card;
        }),
      );
    }

    function renderDevices(): void {
      const total = batches.reduce((n, b) => n + b.devices.length, 0);
      devicePanel.hidden = total === 0;
      deviceHead.textContent = `Devices (${total})`;
      const table = el('table', 'device-table');
      const head = el('tr');
      for (const h of ['Batch', 'Type', 'Serial', 'Name', 'Comments', 'FortiCloud key', 'Group']) {
        head.append(el('th', undefined, h));
      }
      table.append(head);
      for (const batch of batches) {
        for (const d of batch.devices) {
          const tr = el('tr');
          tr.append(
            el('td', undefined, String(batch.index)),
            el('td', undefined, d.kind === 'ap' ? 'AP' : 'Switch'),
            el('td', 'mono', d.serial),
            el('td', undefined, d.name),
            el('td', undefined, d.comment),
            el('td', 'mono', d.cloudKey),
            el('td', undefined, d.group),
          );
          table.append(tr);
        }
      }
      deviceWrap.replaceChildren(table);
    }

    function renderWarnings(warnings: Warning[]): void {
      const line = (w: Warning): string => (w.line !== undefined ? `Row ${w.line}: ${w.message}` : w.message);
      const problems = warnings.filter((w) => w.kind !== 'fix');
      const fixes = warnings.filter((w) => w.kind === 'fix');
      setShown(warnBox, problems.length > 0);
      if (problems.length) {
        const ul = el('ul');
        for (const w of problems) ul.append(el('li', undefined, line(w)));
        warnBox.replaceChildren(el('strong', undefined, `Warnings (${problems.length})`), ul);
      }
      setShown(fixBox, fixes.length > 0);
      if (fixes.length) {
        const ul = el('ul');
        for (const w of fixes) ul.append(el('li', undefined, line(w)));
        fixBox.replaceChildren(el('summary', undefined, `Auto-corrected (${fixes.length})`), ul);
      }
    }

    function regenerate(): void {
      const table = parseDeviceTable(text, delimiter === 'auto' ? undefined : delimiter);
      tableWidth = table.width;
      const detected = detectDeviceColumns(table);
      const hasHeader = headerChoice === 'auto' ? detected.hasHeader : headerChoice === 'yes';
      rebuildColumnSelects(table.width, hasHeader ? (table.rows[0] ?? null) : null, detected);

      columns = { ...detected, hasHeader };
      for (const { field } of DEVICE_FIELDS) {
        const choice = columnChoice[field];
        if (choice === 'none') columns[field] = null;
        else if (choice !== 'auto') columns[field] = choice;
      }
      // A column picked by hand for one field cannot also be auto-assigned to another.
      for (const { field } of DEVICE_FIELDS) {
        if (columnChoice[field] !== 'auto') continue;
        const clash = DEVICE_FIELDS.some(
          (other) =>
            other.field !== field &&
            typeof columnChoice[other.field] === 'number' &&
            columnChoice[other.field] === columns[field],
        );
        if (clash) columns[field] = null;
      }

      const found = DEVICE_FIELDS.filter((f) => columns[f.field] !== null).map(
        (f) => `${f.label} ${columnLabel(columns[f.field]!)}`,
      );
      columnsSummary.textContent =
        table.rows.length && found.length ? `Columns — ${found.join(' · ')}` : 'Columns';

      const read = readDevices(table, columns, { kind: kindChoice });
      const result = generateOnboarding(read.devices, opts);
      batches = result.batches;

      const isEmpty = batches.length === 0;
      setShown(batchList, !isEmpty);
      setShown(empty, isEmpty);
      downloadAllBtn.disabled = isEmpty;
      inventoryBtn.disabled = isEmpty;
      const parts = [
        plural(result.stats.switches, 'switch', 'switches'),
        plural(result.stats.aps, 'AP'),
        plural(batches.length, 'batch', 'batches'),
      ];
      if (read.skipped) parts.push(`${read.skipped} skipped`);
      stats.textContent = parts.join(' · ');
      setShown(stats, !isEmpty || read.skipped > 0);

      renderBatches();
      renderDevices();
      renderWarnings([...read.warnings, ...result.warnings]);
    }

    renderOptions();
    regenerate();
  },
};
