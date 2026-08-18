import type { Tool, Warning } from '../types';
import { el, inputPane, outputPane, selectField, textField } from './components';
import {
  MATCH_OPS,
  applyRules,
  changeSummary,
  dryRun,
  emitDelta,
  emitFullBlock,
  findBlock,
  parse,
  parseRulesJson,
  serializeRulesJson,
  type Condition,
  type DryRunMatch,
  type MatchOp,
  type OutputMode,
  type Rule,
  type RulesFile,
} from '../lib/forti-edit';

const PLACEHOLDER = [
  'config firewall policy',
  '    edit 1',
  '        set name "Allow-Out"',
  '        set srcintf "x1"',
  '        set dstintf "wan1"',
  '        set srcaddr "all"',
  '        set dstaddr "all"',
  '        set action accept',
  '        set schedule "always"',
  '    next',
  'end',
].join('\n');

type MutKind = 'append' | 'remove' | 'set';

interface CondRow {
  field: string;
  op: MatchOp;
  value: string;
}

interface MutRow {
  kind: MutKind;
  field: string;
  value: string; // comma-separated values for kind 'set', like the CLI
}

interface RuleModel {
  where: CondRow[];
  muts: MutRow[];
}

const emptyCond = (): CondRow => ({ field: '', op: 'contains', value: '' });
const emptyMut = (): MutRow => ({ kind: 'append', field: '', value: '' });
const newRule = (): RuleModel => ({ where: [emptyCond()], muts: [emptyMut()] });

export const fortiEditTool: Tool = {
  id: 'forti-edit',
  title: 'Forti Edit',
  description:
    'Bulk query and edit pasted FortiOS config or show output — match entries by field conditions, then append, remove, or replace values.',
  mount(container) {
    let text = '';
    let section = 'firewall policy';
    let mode: OutputMode = 'delta';
    let importNote: string | null = null;
    let rules: RuleModel[] = [newRule()];

    const layout = el('div', 'tool-layout');
    const input = inputPane(PLACEHOLDER, (v) => {
      text = v;
      recompute();
    });

    const panel = el('section', 'panel');
    panel.append(el('h2', undefined, 'Rules'));

    const sectionField = textField(
      'Section',
      section,
      (v) => {
        section = v;
        recompute();
      },
      'firewall policy',
    );
    panel.append(sectionField);
    const sectionInput = sectionField.querySelector('input') as HTMLInputElement;

    const rulesBox = el('div');
    panel.append(rulesBox);

    const addRuleBtn = el('button', 'btn', '+ Rule');
    const importBtn = el('button', 'btn', 'Import JSON');
    const exportBtn = el('button', 'btn', 'Export JSON');
    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    const ruleBtnRow = el('div', 'btn-row');
    ruleBtnRow.append(addRuleBtn, importBtn, exportBtn, fileInput);
    panel.append(ruleBtnRow);

    panel.append(
      selectField(
        'Output mode',
        [
          { value: 'delta', label: 'delta — only changed entries' },
          { value: 'full', label: 'full — rebuild whole section' },
        ],
        mode,
        (v) => {
          mode = v as OutputMode;
          recompute();
        },
      ),
    );

    panel.append(el('h2', undefined, 'Match preview'));
    const previewBox = el('div', 'match-list');
    panel.append(previewBox);

    const output = outputPane('forti-edit.txt');

    const right = el('div');
    right.append(panel, output.root);
    layout.append(input.root, right);
    container.append(layout);

    addRuleBtn.addEventListener('click', () => {
      rules.push(newRule());
      renderRules();
      recompute();
    });

    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files?.[0];
      fileInput.value = '';
      if (!f) return;
      const parsed = parseRulesJson(await f.text());
      if (!parsed.file) {
        importNote = `Rules import failed: ${parsed.error ?? 'unknown error'}`;
        recompute();
        return;
      }
      importNote = null;
      if (parsed.file.section) {
        section = parsed.file.section;
        sectionInput.value = section;
      }
      rules = parsed.file.rules.map(modelFromRule);
      if (rules.length === 0) rules = [newRule()];
      renderRules();
      recompute();
    });

    exportBtn.addEventListener('click', () => {
      const file: RulesFile = { section, rules: effectiveRules() };
      const blob = new Blob([serializeRulesJson(file)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = el('a');
      a.href = url;
      a.download = 'forti-edit-rules.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    function modelFromRule(r: Rule): RuleModel {
      const m: RuleModel = {
        where: (r.where ?? []).map(([field, op, value]) => ({
          field,
          op: op as MatchOp, // unknown ops surface as a warning on recompute
          value,
        })),
        muts: [],
      };
      for (const [field, value] of r.append ?? []) m.muts.push({ kind: 'append', field, value });
      for (const [field, value] of r.remove ?? []) m.muts.push({ kind: 'remove', field, value });
      for (const [field, vals] of r.set ?? []) {
        m.muts.push({ kind: 'set', field, value: vals.join(',') });
      }
      if (m.where.length === 0) m.where.push(emptyCond());
      if (m.muts.length === 0) m.muts.push(emptyMut());
      return m;
    }

    /** Rows with an empty field are treated as not-yet-filled and skipped. */
    function effectiveRules(): Rule[] {
      return rules.map((r) => {
        const rule: Rule = {
          where: r.where
            .filter((c) => c.field.trim() !== '')
            .map((c): Condition => [c.field.trim(), c.op, c.value]),
        };
        const append: [string, string][] = [];
        const remove: [string, string][] = [];
        const set: [string, string[]][] = [];
        for (const m of r.muts) {
          const field = m.field.trim();
          if (field === '') continue;
          if (m.kind === 'append') append.push([field, m.value]);
          else if (m.kind === 'remove') remove.push([field, m.value]);
          else set.push([field, m.value.split(',')]);
        }
        if (append.length) rule.append = append;
        if (remove.length) rule.remove = remove;
        if (set.length) rule.set = set;
        return rule;
      });
    }

    function condRowEl(rule: RuleModel, c: CondRow): HTMLElement {
      const row = el('div', 'rule-row');
      const field = el('input');
      field.placeholder = 'field (e.g. srcintf)';
      field.value = c.field;
      field.addEventListener('input', () => {
        c.field = field.value;
        recompute();
      });
      const op = el('select');
      for (const o of MATCH_OPS) {
        const opt = el('option', undefined, o);
        opt.value = o;
        op.append(opt);
      }
      op.value = c.op;
      const value = el('input');
      value.placeholder = 'value';
      value.value = c.value;
      const syncValue = () => {
        value.disabled = c.op === 'exists' || c.op === 'absent';
      };
      syncValue();
      op.addEventListener('change', () => {
        c.op = op.value as MatchOp;
        syncValue();
        recompute();
      });
      value.addEventListener('input', () => {
        c.value = value.value;
        recompute();
      });
      const rm = el('button', 'btn', '×');
      rm.title = 'Remove condition';
      rm.addEventListener('click', () => {
        rule.where.splice(rule.where.indexOf(c), 1);
        renderRules();
        recompute();
      });
      row.append(field, op, value, rm);
      return row;
    }

    function mutRowEl(rule: RuleModel, m: MutRow): HTMLElement {
      const row = el('div', 'rule-row');
      const kind = el('select');
      for (const k of ['append', 'remove', 'set'] as const) {
        const opt = el('option', undefined, k);
        opt.value = k;
        kind.append(opt);
      }
      kind.value = m.kind;
      const field = el('input');
      field.placeholder = 'field (e.g. srcintf)';
      field.value = m.field;
      const value = el('input');
      value.value = m.value;
      const syncValue = () => {
        value.placeholder = m.kind === 'set' ? 'value1,value2,…' : 'value';
      };
      syncValue();
      kind.addEventListener('change', () => {
        m.kind = kind.value as MutKind;
        syncValue();
        recompute();
      });
      field.addEventListener('input', () => {
        m.field = field.value;
        recompute();
      });
      value.addEventListener('input', () => {
        m.value = value.value;
        recompute();
      });
      const rm = el('button', 'btn', '×');
      rm.title = 'Remove mutation';
      rm.addEventListener('click', () => {
        rule.muts.splice(rule.muts.indexOf(m), 1);
        renderRules();
        recompute();
      });
      row.append(kind, field, value, rm);
      return row;
    }

    function renderRules(): void {
      rulesBox.replaceChildren();
      rules.forEach((rule, ri) => {
        const card = el('div', 'rule-card');
        const head = el('h3', undefined, `Rule ${ri + 1}`);
        const rmRule = el('button', 'btn', 'Remove rule');
        rmRule.addEventListener('click', () => {
          rules.splice(ri, 1);
          if (rules.length === 0) rules.push(newRule());
          renderRules();
          recompute();
        });
        head.append(rmRule);
        card.append(head);

        card.append(el('div', 'stats', 'Match conditions (AND-ed; empty field = ignored)'));
        for (const c of rule.where) card.append(condRowEl(rule, c));
        card.append(el('div', 'stats', 'Mutations'));
        for (const m of rule.muts) card.append(mutRowEl(rule, m));

        const btnRow = el('div', 'btn-row');
        const addCond = el('button', 'btn', '+ condition');
        addCond.addEventListener('click', () => {
          rule.where.push(emptyCond());
          renderRules();
          recompute();
        });
        const addMut = el('button', 'btn', '+ mutation');
        addMut.addEventListener('click', () => {
          rule.muts.push(emptyMut());
          renderRules();
          recompute();
        });
        btnRow.append(addCond, addMut);
        card.append(btnRow);
        rulesBox.append(card);
      });
    }

    function renderPreview(perRule: DryRunMatch[] | null, message?: string): void {
      previewBox.replaceChildren();
      if (perRule === null) {
        previewBox.append(el('div', undefined, message ?? ''));
        return;
      }
      perRule.forEach((m, i) => {
        const desc = m.conditions.map((c) => c.join(':')).join(' AND ') || '(all)';
        const n = m.entries.length;
        previewBox.append(
          el('div', undefined, `Rule ${i + 1}: ${desc} → ${n} entr${n === 1 ? 'y' : 'ies'}`),
        );
        for (const e of m.entries) {
          const line = el('div', undefined, `edit ${e.key}${e.name ? '  ' + e.name : ''}`);
          line.style.paddingLeft = '1.2em';
          previewBox.append(line);
        }
      });
    }

    function recompute(): void {
      const warnings: Warning[] = [];
      if (importNote) warnings.push({ message: importNote });
      if (text.trim() === '') {
        renderPreview(null, 'Paste config on the left to preview matches.');
        warnings.push({ message: 'No input — paste FortiOS config or show output.' });
        output.update('', '', warnings);
        return;
      }
      try {
        const root = parse(text);
        const block = findBlock(root, section);
        if (block === null) {
          renderPreview(null, `section '${section}' not found`);
          warnings.push({ message: `section '${section}' not found in input` });
          output.update('', '', warnings);
          return;
        }
        const ruleList = effectiveRules();
        renderPreview(dryRun(block, ruleList));
        const changed = applyRules(block, ruleList);
        const body =
          changed.length === 0
            ? ''
            : (mode === 'full' ? emitFullBlock(block) : emitDelta(block, changed)) + '\n';
        output.update(body, changeSummary(changed.length, section), warnings);
      } catch (err) {
        renderPreview(null, '');
        warnings.push({ message: err instanceof Error ? err.message : String(err) });
        output.update('', '', warnings);
      }
    }

    renderRules();
    recompute();
  },
};
