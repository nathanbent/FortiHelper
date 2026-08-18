import type { Tool } from '../types';
import { el, checkbox, selectField, numberField, textField, inputPane, outputPane } from './components';
import {
  generateWebContent,
  CONTENT_LANGS,
  type WebContentOptions,
  type ContentFormat,
  type ContentPatternType,
  type ContentAction,
  type ContentLang,
} from '../lib/webfilter-content';

const PLACEHOLDER = [
  '# One banned word or phrase per line; blank lines and # comments are ignored',
  '# Quote a phrase to count it only when it appears exactly as written',
  'gambling',
  'forti*',
  '"free money"',
].join('\n');

/** Matching behavior per pattern type, from the FortiOS admin guide. */
const PATTERN_HINTS: Record<ContentPatternType, string> = {
  wildcard: 'forti*.com matches fortinet.com and fortiguard.com — * is any characters',
  regexp: 'forti*.com matches fortiii.com but not fortinet.com — * repeats the previous character',
};

/** All options resolved. */
type ContentState = Required<WebContentOptions>;

export const webfilterContentTool: Tool = {
  id: 'content-filter',
  title: 'Content Filter',
  description:
    'Generate FortiOS web content filter (banned word) entries from a word list. ' +
    'Scores for every pattern matching a page are summed, and the page is blocked once the total reaches the threshold.',
  mount(container) {
    const state: ContentState = {
      patternType: 'wildcard',
      action: 'block',
      status: 'enable',
      lang: 'western',
      score: 10,
      dedupe: true,
      sort: true,
      format: 'full',
      listId: 1,
      listName: 'webfilter',
      comment: '',
      bindProfile: false,
      profileName: 'webfilter',
      threshold: 10,
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
    const output = outputPane('content-filter.txt');

    const right = el('div');
    right.append(options, output.root);
    layout.append(input.root, right);
    container.append(layout);

    /**
     * Rebuild the options panel. Called by the controls that change which
     * fields are relevant (format, profile binding) — text and number inputs
     * only regenerate, so they keep focus while typing.
     */
    function renderOptions() {
      const main: HTMLElement[] = [
        el('h2', undefined, 'Options'),
        selectField(
          'Output format',
          [
            { value: 'full', label: 'full config webfilter content' },
            { value: 'entries', label: 'entries only (paste into config entries)' },
          ],
          state.format,
          (v) => {
            state.format = v as ContentFormat;
            renderOptions();
            regenerate();
          },
        ),
        selectField(
          'Pattern type',
          [
            { value: 'wildcard', label: 'wildcard' },
            { value: 'regexp', label: 'regular expression' },
          ],
          state.patternType,
          (v) => {
            state.patternType = v as ContentPatternType;
            renderOptions();
            regenerate();
          },
          PATTERN_HINTS[state.patternType],
        ),
        selectField(
          'Action',
          [
            { value: 'block', label: 'block' },
            { value: 'exempt', label: 'exempt' },
          ],
          state.action,
          (v) => {
            state.action = v as ContentAction;
            regenerate();
          },
        ),
        numberField(
          'Score per pattern',
          state.score,
          (v) => {
            state.score = v;
            regenerate();
          },
          { min: 0, step: 1 },
        ),
        checkbox('Remove duplicates', state.dedupe, (v) => {
          state.dedupe = v;
          regenerate();
        }, 'case-insensitive, keeps first occurrence'),
        checkbox('Sort patterns', state.sort, (v) => {
          state.sort = v;
          regenerate();
        }, 'case-insensitive'),
      ];

      // --- Advanced ---
      const adv: HTMLElement[] = [
        selectField(
          'Language',
          CONTENT_LANGS,
          state.lang,
          (v) => {
            state.lang = v as ContentLang;
            regenerate();
          },
        ),
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
      ];

      if (state.format === 'full') {
        adv.push(
          numberField(
            'Content list ID',
            state.listId,
            (v) => {
              state.listId = v;
              regenerate();
            },
            { min: 1, step: 1 },
          ),
          textField('Content list name', state.listName, (v) => {
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
          checkbox(
            'Bind to a web filter profile',
            state.bindProfile,
            (v) => {
              state.bindProfile = v;
              renderOptions();
              regenerate();
            },
            'appends config webfilter profile … set bword-table',
          ),
        );

        if (state.bindProfile) {
          adv.push(
            textField('Web filter profile name', state.profileName, (v) => {
              state.profileName = v;
              regenerate();
            }),
            numberField(
              'Block threshold (bword-threshold)',
              state.threshold,
              (v) => {
                state.threshold = v;
                regenerate();
              },
              { min: 0, step: 1 },
            ),
          );
        }
      }

      const details = el('details', 'adv');
      details.open = advancedOpen;
      details.addEventListener('toggle', () => (advancedOpen = details.open));
      details.append(el('summary', undefined, 'Advanced'), ...adv);

      const notes = el('details', 'adv');
      notes.append(el('summary', undefined, 'How scoring works'));
      const ul = el('ul');
      for (const note of [
        'Each pattern scores once per page, however many times it appears.',
        'For an unquoted phrase, every word in it scores separately.',
        'A quoted phrase scores only when it appears exactly as written.',
        'The page is blocked once the summed score reaches the threshold.',
      ]) {
        ul.append(el('li', undefined, note));
      }
      notes.append(ul);

      options.replaceChildren(...main, details, notes);
    }

    function regenerate() {
      const { output: script, warnings, stats } = generateWebContent(text, state);
      const parts = [`${stats.patterns} ${stats.patterns === 1 ? 'pattern' : 'patterns'}`];
      if (stats.duplicatesRemoved > 0) {
        parts.push(
          `${stats.duplicatesRemoved} duplicate${stats.duplicatesRemoved === 1 ? '' : 's'} removed`,
        );
      }
      if (stats.patterns > 0 && stats.patternsToBlock > 0) {
        parts.push(
          stats.patternsToBlock === 1
            ? 'one match blocks a page'
            : `${stats.patternsToBlock} matches block a page`,
        );
      }
      output.update(script, parts.join(' · '), warnings);
    }

    renderOptions();
    regenerate();
  },
};
