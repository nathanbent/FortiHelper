import type { Tool } from '../types';
import {
  checkbox,
  el,
  inputPane,
  numberField,
  outputPane,
  selectField,
  setShown,
  textField,
} from './components';
import {
  collectFqdnsToResolve,
  generateObjects,
  withDefaults,
} from '../lib/object-helper';
import type { DnsResults, ObjectHelperStats } from '../lib/object-helper';
import { resolveFqdns } from '../lib/dns';
import { FORTI_COLORS, colorHex } from '../lib/colors';

type InputMode = 'plain' | 'pairs' | 'delimited';

/**
 * Labeled FortiGate color dropdown ("<id> — <name>") with a live swatch.
 * ID 0 means "(none)" (the default; only emitted when the matching enable
 * checkbox is on, and 0 is not a real FortiGate color anyway).
 */
function colorField(
  label: string,
  value: number,
  onChange: (id: number) => void,
): HTMLDivElement {
  const wrap = el('div', 'field');
  const lab = el('label', undefined, label);
  const row = el('div', 'swatch-row');
  const swatch = el('span', 'swatch');
  const select = el('select');
  select.style.flex = '1';

  const none = el('option', undefined, '0 — (none)');
  none.value = '0';
  select.append(none);
  for (const c of FORTI_COLORS) {
    const o = el('option', undefined, `${c.id} — ${c.name}`);
    o.value = String(c.id);
    select.append(o);
  }
  select.value = String(value);

  const updateSwatch = (): void => {
    const hex = colorHex(Number(select.value));
    // An empty bordered square reads as a stray checkbox, so drop it for
    // color 0 (none) rather than showing a blank chip.
    setShown(swatch, hex !== null);
    swatch.style.background = hex ?? 'transparent';
  };
  updateSwatch();

  select.addEventListener('change', () => {
    updateSwatch();
    onChange(Number(select.value));
  });

  row.append(swatch, select);
  wrap.append(lab, row);
  return wrap;
}

const INPUT_PLACEHOLDER = [
  'example.com',
  '*.cdn.example.net',
  '10.0.0.5',
  '192.168.1.0/24',
  '10.0.0.1-10.0.0.9',
].join('\n');

function statsLine(stats: ObjectHelperStats): string {
  const parts = [
    `FQDN: ${stats.writtenFqdn}`,
    `Resolved IP: ${stats.writtenIp}`,
    `Direct IP: ${stats.writtenDirectIp}`,
    `Ranges: ${stats.writtenIpRange}`,
    `Skipped: ${stats.skipped}`,
    `Duplicates: ${stats.duplicates}`,
  ];
  if (stats.dnsFailures) parts.push(`DNS failures: ${stats.dnsFailures}`);
  parts.push(`Total objects: ${stats.total}`);
  return parts.join(' · ');
}

export const objectHelperTool: Tool = {
  id: 'object-helper',
  title: 'Object Helper',
  description:
    'Generate FortiGate firewall address objects and groups from FQDNs, IPs, CIDRs, and ranges.',
  mount(container) {
    // ---------- state ----------
    const opts = withDefaults();
    let inputText = '';
    let mode: InputMode = 'plain';
    let delimiter = ':';
    let dnsCache: DnsResults = {};

    // ---------- left column ----------
    const left = el('div');

    const input = inputPane(INPUT_PLACEHOLDER, (text) => {
      inputText = text;
      regenerate();
    });

    const formatPanel = el('section', 'panel');
    formatPanel.append(el('h2', undefined, 'Input format'));

    const delimField = textField('Delimiter', delimiter, (v) => {
      delimiter = v;
      regenerate();
    }, 'e.g. : or \\t');
    delimField.style.display = 'none';

    formatPanel.append(
      selectField(
        'Mode',
        [
          { value: 'plain', label: 'One FQDN / IP per line' },
          { value: 'pairs', label: 'Name + value pairs (alternating lines)' },
          { value: 'delimited', label: 'name:value (delimited lines)' },
        ],
        mode,
        (v) => {
          mode = v as InputMode;
          delimField.style.display = mode === 'delimited' ? '' : 'none';
          regenerate();
        },
      ),
      delimField,
      checkbox('Input comments', opts.useInputComment, (v) => {
        opts.useInputComment = v;
        regenerate();
      }, 'line after each entry becomes the object comment'),
      checkbox('Lowercase FQDNs', opts.lowercaseFqdn, (v) => {
        opts.lowercaseFqdn = v;
        regenerate();
      }),
    );

    left.append(input.root, formatPanel);

    // ---------- right column: options ----------
    const right = el('div');
    const optionsPanel = el('section', 'panel');
    optionsPanel.append(el('h2', undefined, 'Options'));

    // Prefix
    const prefixRow = el('div', 'field-row');
    prefixRow.append(
      textField('Prefix', opts.namePrefix, (v) => {
        opts.namePrefix = v;
        regenerate();
      }),
      textField('Prefix delimiter', opts.namePrefixDelim, (v) => {
        opts.namePrefixDelim = v;
        regenerate();
      }),
    );
    const groupNameField = textField('All-objects group name', opts.allObjectsGroupName, (v) => {
      opts.allObjectsGroupName = v;
      regenerate();
    }, 'supports {prefix}');

    const bulkCommentField = textField(
      'Comment for every object',
      opts.bulkComment,
      (v) => {
        opts.bulkComment = v;
        regenerate();
      },
      'appended to each existing comment, or used alone',
    );

    const colorSelect = colorField('Color', opts.colorId, (v) => {
      opts.colorId = v;
      regenerate();
    });

    const interfaceField = textField('Interface', opts.associatedInterface, (v) => {
      opts.associatedInterface = v;
      regenerate();
    });

    optionsPanel.append(
      checkbox('Prefix object names', opts.enablePrefix, (v) => {
        opts.enablePrefix = v;
        syncDependents();
        regenerate();
      }),
      prefixRow,
      checkbox('Emit FQDN objects', opts.outputFqdnObjects, (v) => {
        opts.outputFqdnObjects = v;
        regenerate();
      }),
      checkbox('Emit resolved IP objects (needs DNS)', opts.outputIpObjects, (v) => {
        opts.outputIpObjects = v;
        updateResolveVisibility();
        regenerate();
      }),
      checkbox('All-objects group', opts.enableAllObjectsGroup, (v) => {
        opts.enableAllObjectsGroup = v;
        syncDependents();
        regenerate();
      }),
      groupNameField,
      checkbox('Per-FQDN groups', opts.enablePerFqdnGroup, (v) => {
        opts.enablePerFqdnGroup = v;
        regenerate();
      }),
      checkbox('Comments', opts.enableComment, (v) => {
        opts.enableComment = v;
        syncDependents();
        regenerate();
      }),
      bulkCommentField,
      checkbox('Color', opts.enableColor, (v) => {
        opts.enableColor = v;
        syncDependents();
        regenerate();
      }),
      colorSelect,
      checkbox('Associated interface', opts.enableAssociatedInterface, (v) => {
        opts.enableAssociatedInterface = v;
        syncDependents();
        regenerate();
      }),
      interfaceField,
      checkbox('Allow routing', opts.enableAllowRouting, (v) => {
        opts.enableAllowRouting = v;
        regenerate();
      }),
    );

    const cacheTtlField = numberField('Cache TTL (seconds)', opts.cacheTtlSeconds, (v) => {
      opts.cacheTtlSeconds = v;
      regenerate();
    }, { min: 0, step: 1 });

    const groupCommentField = textField('Group comment template', opts.groupCommentTemplate, (v) => {
      opts.groupCommentTemplate = v;
      regenerate();
    }, '{resolved_at}');

    const groupColorSelect = colorField('Group color', opts.groupColorId, (v) => {
      opts.groupColorId = v;
      regenerate();
    });

    /** Hide the fields whose toggle is currently off. */
    function syncDependents(): void {
      setShown(prefixRow, opts.enablePrefix);
      setShown(groupNameField, opts.enableAllObjectsGroup);
      setShown(bulkCommentField, opts.enableComment);
      setShown(colorSelect, opts.enableColor);
      setShown(interfaceField, opts.enableAssociatedInterface);
      setShown(cacheTtlField, opts.enableCacheTtl);
      setShown(groupCommentField, opts.enableGroupComment);
      setShown(groupColorSelect, opts.enableGroupColor);
    }

    // Advanced
    const adv = el('details', 'adv');
    adv.append(el('summary', undefined, 'Advanced'));
    adv.append(
      textField(
        'Bulk comment separator',
        opts.bulkCommentSeparator,
        (v) => {
          opts.bulkCommentSeparator = v;
          regenerate();
        },
        'joins an existing comment and the bulk comment',
      ),
      textField('FQDN comment template', opts.commentTemplateFqdn, (v) => {
        opts.commentTemplateFqdn = v;
        regenerate();
      }, '{fqdn} {comment}'),
      textField('Resolved-IP comment template', opts.commentTemplateIp, (v) => {
        opts.commentTemplateIp = v;
        regenerate();
      }, '{fqdn} {ip} {resolved_at} {comment}'),
      textField('Direct-IP comment template', opts.commentTemplateDirectIp, (v) => {
        opts.commentTemplateDirectIp = v;
        regenerate();
      }, '{ip} {comment}'),
    );

    const dnsRow = el('div', 'field-row');
    dnsRow.append(
      numberField('Max IPs per FQDN', opts.maxIpsPerFqdn, (v) => {
        opts.maxIpsPerFqdn = v;
        regenerate();
      }, { min: 1, step: 1 }),
      numberField('DNS timeout (s)', opts.dnsTimeoutSeconds, (v) => {
        opts.dnsTimeoutSeconds = v;
      }, { min: 0.5, step: 0.5 }),
      numberField('DNS concurrency', opts.dnsWorkers, (v) => {
        opts.dnsWorkers = v;
      }, { min: 1, max: 50, step: 1 }),
    );
    adv.append(dnsRow);

    const namingRow = el('div', 'field-row');
    namingRow.append(
      textField('IP/CIDR separator', opts.ipCidrSeparator, (v) => {
        opts.ipCidrSeparator = v;
        regenerate();
      }, '/ or _'),
      textField('Per-FQDN group suffix', opts.perFqdnGroupSuffix, (v) => {
        opts.perFqdnGroupSuffix = v;
        regenerate();
      }),
    );
    adv.append(
      namingRow,
      selectField(
        'Resolved IP object naming',
        [
          { value: 'index', label: 'Indexed (base-IP-1, base-IP-2, …)' },
          { value: 'ip', label: 'IP with underscores (base-1_1_1_1)' },
        ],
        opts.ipObjectsUseIndex ? 'index' : 'ip',
        (v) => {
          opts.ipObjectsUseIndex = v === 'index';
          regenerate();
        },
      ),
      textField('IP object suffix', opts.ipObjectSuffix, (v) => {
        opts.ipObjectSuffix = v;
        regenerate();
      }),
      checkbox('Fabric object', opts.enableFabricObject, (v) => {
        opts.enableFabricObject = v;
        regenerate();
      }),
      checkbox('Passive FQDN learning', opts.enablePassiveFqdnLearning, (v) => {
        opts.enablePassiveFqdnLearning = v;
        regenerate();
      }, 'FQDN objects only'),
      checkbox('Cache TTL', opts.enableCacheTtl, (v) => {
        opts.enableCacheTtl = v;
        syncDependents();
        regenerate();
      }, 'FQDN objects only'),
      cacheTtlField,
      checkbox('Group comment', opts.enableGroupComment, (v) => {
        opts.enableGroupComment = v;
        syncDependents();
        regenerate();
      }),
      groupCommentField,
      checkbox('Group color', opts.enableGroupColor, (v) => {
        opts.enableGroupColor = v;
        syncDependents();
        regenerate();
      }),
      groupColorSelect,
      checkbox('Group type', opts.enableGroupType, (v) => {
        opts.enableGroupType = v;
        regenerate();
      }),
      textField('Group type value', opts.groupType, (v) => {
        opts.groupType = v;
        regenerate();
      }),
      checkbox('Group category', opts.enableGroupCategory, (v) => {
        opts.enableGroupCategory = v;
        regenerate();
      }),
      textField('Group category value', opts.groupCategory, (v) => {
        opts.groupCategory = v;
        regenerate();
      }),
      checkbox('Group fabric object', opts.enableGroupFabricObject, (v) => {
        opts.enableGroupFabricObject = v;
        regenerate();
      }),
    );
    optionsPanel.append(adv);

    // DNS resolve button (only relevant when resolved IP objects are on)
    const resolveRow = el('div', 'btn-row');
    const resolveBtn = el('button', 'btn primary', 'Resolve DNS & generate');
    const resolveNote = el('span', 'stats', '');
    resolveRow.append(resolveBtn, resolveNote);
    optionsPanel.append(resolveRow);

    const output = outputPane('fortigate-objects.txt');
    right.append(optionsPanel, output.root);

    function updateResolveVisibility(): void {
      resolveRow.style.display = opts.outputIpObjects ? '' : 'none';
    }
    updateResolveVisibility();

    /** Apply the input-format mode selection onto the options object. */
    function applyMode(): void {
      opts.useExplicitNames = mode === 'pairs';
      opts.nameFqdnDelimiter = mode === 'delimited' ? delimiter.replace(/\\t/g, '\t') : '';
    }

    /**
     * Synchronous regeneration using whatever DNS results are cached.
     * Never touches the network.
     */
    function regenerate(): void {
      applyMode();
      try {
        const result = generateObjects(inputText, opts, dnsCache);
        const warnings = [...result.warnings];
        if (opts.outputIpObjects) {
          const unresolved = collectFqdnsToResolve(inputText, opts).filter(
            (f) => !(f in dnsCache),
          );
          if (unresolved.length) {
            warnings.unshift({
              message:
                `${unresolved.length} FQDN(s) not resolved yet — ` +
                'use "Resolve DNS & generate" to look them up.',
            });
          }
        }
        // The generator emits the `config … / end` scaffold even with nothing
        // in it, so the object count is what says whether anything was made.
        output.update(
          result.output,
          statsLine(result.stats),
          warnings,
          result.stats.total === 0,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        output.update('', '', [{ message: `Generation failed: ${msg}` }]);
      }
    }

    resolveBtn.addEventListener('click', async () => {
      applyMode();
      const fqdns = collectFqdnsToResolve(inputText, opts).filter((f) => !(f in dnsCache));
      if (!fqdns.length) {
        resolveNote.textContent = 'Nothing new to resolve.';
        regenerate();
        return;
      }
      resolveBtn.disabled = true;
      resolveNote.textContent = `Resolving ${fqdns.length} FQDN(s)…`;
      try {
        const results = await resolveFqdns(fqdns, {
          timeoutMs: Math.round(opts.dnsTimeoutSeconds * 1000),
          maxConcurrent: opts.dnsWorkers,
          maxIps: opts.maxIpsPerFqdn,
          onProgress: (done, total) => {
            resolveNote.textContent = `Resolving… ${done}/${total}`;
          },
        });
        dnsCache = { ...dnsCache, ...results };
        resolveNote.textContent = `Resolved ${fqdns.length} FQDN(s).`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        resolveNote.textContent = `DNS resolution failed: ${msg}`;
      } finally {
        resolveBtn.disabled = false;
      }
      regenerate();
    });

    // ---------- layout ----------
    const layout = el('div', 'tool-layout');
    layout.append(left, right);
    container.append(layout);

    syncDependents();
    regenerate();
  },
};
