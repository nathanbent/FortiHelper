import type { Tool } from '../types';
import {
  el,
  checkbox,
  checkboxGroup,
  selectField,
  numberField,
  textField,
  inputPane,
  outputPane,
} from './components';
import {
  generateWebfilter,
  EXEMPT_FLAGS,
  EXEMPT_FLAG_LABELS,
  type WebfilterOptions,
  type WebfilterFormat,
  type UrlFilterType,
  type UrlFilterAction,
  type WildcardPrefix,
  type ExemptFlag,
} from '../lib/webfilter';

const PLACEHOLDER = [
  '# One domain per line; blank lines and # comments are ignored',
  '# A domain containing * is detected as a wildcard entry',
  'example.com',
  '*facebook.com',
  'cdn.example.net',
].join('\n');

/** Matching behavior per type, summarized from the FortiOS admin guide. */
const TYPE_HINTS: Record<UrlFilterType | 'auto', string> = {
  auto: 'domains containing * become wildcard entries, the rest simple',
  simple: 'matches the full URL; subdomains also match (slack.com matches hooks.slack.com)',
  wildcard: '*facebook.com matches www.facebook.com, message.facebook.com, …',
  regex: 'matches on regular expression rules',
};

/** All options resolved, except `type` and `includeSubdomains` (undefined = omit the line). */
type WebfilterState = Required<Omit<WebfilterOptions, 'type' | 'includeSubdomains'>> & {
  type?: UrlFilterType | 'auto';
  includeSubdomains?: boolean;
};

export const webfilterTool: Tool = {
  id: 'webfilter',
  title: 'Webfilter Generator',
  description:
    'Generate FortiOS static URL filter entries from a domain list. Wildcards are detected automatically.',
  mount(container) {
    const state: WebfilterState = {
      status: 'enable',
      action: 'block',
      dedupe: true,
      sort: true,
      // The library default stays 'bare' so generateWebfilter() remains
      // byte-identical to the Python script; the UI leads with the complete,
      // paste-and-run config instead.
      format: 'full',
      type: 'auto',
      wildcardPrefix: 'none',
      exempt: [],
      startId: 1,
      listId: 1,
      listName: 'webfilter',
      comment: '',
      bindProfile: false,
      profileName: 'webfilter',
    };
    let text = '';
    // Rebuilding the panel would otherwise collapse the Advanced section
    // every time a select changes.
    let advancedOpen = false;

    const layout = el('div', 'tool-layout');

    const input = inputPane(PLACEHOLDER, (v) => {
      text = v;
      regenerate();
    });

    const options = el('section', 'panel');
    const output = outputPane('webfilter.txt');

    const right = el('div');
    right.append(options, output.root);
    layout.append(input.root, right);
    container.append(layout);

    /**
     * Rebuild the options panel. Called by the controls that change which
     * fields are relevant (format, type, action) — text and number inputs
     * only regenerate, so they keep focus while typing.
     */
    function renderOptions() {
      const main: HTMLElement[] = [
        el('h2', undefined, 'Options'),
        selectField(
          'Output format',
          [
            { value: 'full', label: 'full config webfilter urlfilter' },
            { value: 'entries', label: 'numbered entries (set url)' },
            { value: 'bare', label: 'entry blocks only (edit "<domain>")' },
          ],
          state.format,
          (v) => {
            state.format = v as WebfilterFormat;
            renderOptions();
            regenerate();
          },
        ),
      ];

      // The list number is the first `edit <id>` in the output, so it belongs
      // alongside the format rather than buried in Advanced.
      if (state.format === 'full') {
        main.push(
          numberField(
            'URL filter list ID',
            state.listId,
            (v) => {
              state.listId = v;
              regenerate();
            },
            { min: 1, step: 1 },
          ),
        );
      }

      main.push(
        selectField(
          'Type',
          [
            { value: 'auto', label: 'auto-detect from each domain' },
            { value: 'simple', label: 'simple' },
            { value: 'wildcard', label: 'wildcard' },
            { value: 'regex', label: 'regex' },
            { value: '', label: '(omit — FortiOS defaults to simple)' },
          ],
          state.type ?? '',
          (v) => {
            state.type = (v || undefined) as UrlFilterType | 'auto';
            renderOptions();
            regenerate();
          },
          state.type ? TYPE_HINTS[state.type] : undefined,
        ),
        selectField(
          'Action',
          [
            {
              value: 'block',
              label: state.format === 'bare' ? 'block (no action line)' : 'block',
            },
            { value: 'exempt', label: 'exempt' },
            { value: 'allow', label: 'allow (no log)' },
            { value: 'monitor', label: 'monitor (allow + log)' },
          ],
          state.action,
          (v) => {
            state.action = v as UrlFilterAction;
            // The exempt flags only apply to the exempt action, and their
            // control is hidden otherwise — drop them rather than leave a
            // warning about a field the user can no longer see.
            if (state.action !== 'exempt') state.exempt = [];
            renderOptions();
            regenerate();
          },
        ),
        checkbox('Remove duplicates', state.dedupe, (v) => {
          state.dedupe = v;
          regenerate();
        }, 'case-insensitive, keeps first occurrence'),
        checkbox('Sort domains', state.sort, (v) => {
          state.sort = v;
          regenerate();
        }, 'case-insensitive'),
      );

      // --- Advanced ---
      const adv: HTMLElement[] = [];

      if (state.type === 'wildcard') {
        adv.push(
          selectField(
            'Wildcard prefix',
            [
              { value: 'none', label: 'none — use domains as typed' },
              { value: '*', label: '* — *facebook.com' },
              { value: '*.', label: '*. — *.facebook.com' },
            ],
            state.wildcardPrefix,
            (v) => {
              state.wildcardPrefix = v as WildcardPrefix;
              regenerate();
            },
            'skips domains that already contain *',
          ),
        );
      }

      if (state.action === 'exempt') {
        adv.push(
          checkboxGroup(
            'Exempt from (set exempt)',
            EXEMPT_FLAGS.map((f) => ({ value: f, label: f, hint: EXEMPT_FLAG_LABELS[f] })),
            state.exempt,
            (values) => {
              state.exempt = values as ExemptFlag[];
              regenerate();
            },
          ),
        );
      }

      adv.push(
        selectField(
          'Status',
          [
            { value: 'enable', label: 'enable' },
            { value: 'disable', label: 'disable' },
            { value: 'omit', label: '(omit status line)' },
          ],
          state.status,
          (v) => {
            state.status = v as 'enable' | 'disable' | 'omit';
            regenerate();
          },
        ),
      );

      if (state.format !== 'bare') {
        adv.push(
          numberField(
            'First entry ID',
            state.startId,
            (v) => {
              state.startId = v;
              regenerate();
            },
            { min: 1, step: 1 },
          ),
        );
      }

      if (state.format === 'full') {
        adv.push(
          textField('URL filter list name', state.listName, (v) => {
            state.listName = v;
            regenerate();
          }),
          textField(
            'Comment',
            state.comment,
            (v) => {
              state.comment = v;
              regenerate();
            },
            'optional',
          ),
        );

        // include-subdomains is a simple-type-only setting per the admin guide.
        if (state.type !== 'wildcard' && state.type !== 'regex') {
          adv.push(
            selectField(
              'Include subdomains',
              [
                { value: '', label: '(omit — FortiOS defaults to enable)' },
                { value: 'enable', label: 'enable' },
                { value: 'disable', label: 'disable' },
              ],
              state.includeSubdomains === undefined
                ? ''
                : state.includeSubdomains
                  ? 'enable'
                  : 'disable',
              (v) => {
                state.includeSubdomains = v === '' ? undefined : v === 'enable';
                regenerate();
              },
              'simple type entries only; disable to stop slack.com matching hooks.slack.com',
            ),
          );
        }

        adv.push(
          checkbox(
            'Bind to a web filter profile',
            state.bindProfile,
            (v) => {
              state.bindProfile = v;
              renderOptions();
              regenerate();
            },
            'appends config webfilter profile … set urlfilter-table',
          ),
        );

        if (state.bindProfile) {
          adv.push(
            textField('Web filter profile name', state.profileName, (v) => {
              state.profileName = v;
              regenerate();
            }),
          );
        }
      }

      const details = el('details', 'adv');
      details.open = advancedOpen;
      details.addEventListener('toggle', () => (advancedOpen = details.open));
      details.append(el('summary', undefined, 'Advanced'), ...adv);

      options.replaceChildren(...main, details);
    }

    function regenerate() {
      const { output: script, warnings, stats } = generateWebfilter(text, state);
      const parts = [`${stats.domains} ${stats.domains === 1 ? 'entry' : 'entries'}`];
      if (state.type === 'auto' && stats.wildcardEntries > 0) {
        parts.push(`${stats.wildcardEntries} wildcard`);
      }
      if (stats.duplicatesRemoved > 0) {
        parts.push(
          `${stats.duplicatesRemoved} duplicate${stats.duplicatesRemoved === 1 ? '' : 's'} removed`,
        );
      }
      output.update(script, parts.join(' · '), warnings);
    }

    renderOptions();
    regenerate();
  },
};
