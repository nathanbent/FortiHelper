import type { Warning } from '../../types';
import { apModelFromSerial } from './devices';
import type { Device, DeviceKind } from './devices';

/**
 * FortiGate config for a list of FortiSwitches and FortiAPs: one
 * `managed-switch` / `wtp` entry per device, plus the group membership,
 * cut into batches small enough to paste.
 */

/**
 * What to do with the device's authorization.
 *
 * - `authorize`  — `enable`: approve it (or pre-approve it before it is plugged in)
 * - `reject`     — `disable`: refuse it
 * - `discovered` — back to waiting for approval
 * - `keep`       — emit no authorization line
 */
export type AuthAction = 'authorize' | 'reject' | 'discovered' | 'keep';

const AUTH_VALUE: Record<Exclude<AuthAction, 'keep'>, string> = {
  authorize: 'enable',
  reject: 'disable',
  discovered: 'discovered',
};

/** Field sizes from the FortiOS CLI reference. */
export const MAX_NAME = 35;
export const MAX_SWITCH_DESCRIPTION = 63;
export const MAX_AP_LOCATION = 35;
export const MAX_GROUP_NAME = 35;

/** Serials per `append members` line, so no pasted line runs long. */
const MEMBERS_PER_LINE = 8;

export interface OnboardingOptions {
  /** Devices per batch; 0 puts everything in one. Default 50. */
  batchSize?: number;

  /** Emit `set name` from the Name column. Default true. */
  setName?: boolean;
  /** Emit the Comments column — `description` on a switch, `location` on an AP. Default true. */
  setComment?: boolean;
  /** Text added to every device's comment, after its own. Default ''. */
  bulkComment?: string;
  /** Add the FortiCloud key to the comment. Default false. */
  keyInComment?: boolean;
  /**
   * `append` adds to a group's members; `set` replaces them, which only
   * works when the whole group is in one batch. Default 'append'.
   */
  memberMode?: 'append' | 'set';

  /** `set fsw-wan1-admin …`. Default 'authorize'. */
  switchAuth?: AuthAction;
  /** FortiLink interface: `set fsw-wan1-peer` and the group's `set fortilink`. Default 'fortilink'. */
  fortilink?: string;
  /** Switch group for rows without their own. Default '' (none). */
  switchGroup?: string;
  /** `set switch-profile …`. Default '' (leave alone). */
  switchProfile?: string;
  /** `set access-profile …`. Default '' (leave alone). */
  accessProfile?: string;

  /** `set admin …`. Default 'authorize'. */
  apAuth?: AuthAction;
  /**
   * FortiAP profile for rows without their own. `{model}` becomes the
   * model read from the serial, so `FAP{model}-default` gives each AP its
   * model's default profile. Default '' (leave alone).
   */
  apProfile?: string;
  /** FortiAP group for rows without their own. Default '' (none). */
  apGroup?: string;
}

export interface Batch {
  /** 1-based. */
  index: number;
  devices: Device[];
  /** Config for this batch, ending in a newline. */
  output: string;
}

export interface OnboardingResult {
  batches: Batch[];
  warnings: Warning[];
  stats: { switches: number; aps: number };
}

function q(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function indent(level: number, line: string): string {
  return '    '.repeat(level) + line;
}

function kindLabel(kind: DeviceKind): string {
  return kind === 'ap' ? 'FortiAP' : 'FortiSwitch';
}

/** A device with everything that depends on the options worked out. */
interface Planned {
  device: Device;
  comment: string;
  group: string;
  profile: string;
}

/**
 * Generate the batched config. Warnings about a device carry its input
 * row; the device list itself is validated by `readDevices`.
 */
export function generateOnboarding(
  devices: Device[],
  options: OnboardingOptions = {},
): OnboardingResult {
  const o = {
    batchSize: options.batchSize ?? 50,
    setName: options.setName ?? true,
    setComment: options.setComment ?? true,
    bulkComment: (options.bulkComment ?? '').trim(),
    keyInComment: options.keyInComment ?? false,
    memberMode: options.memberMode ?? 'append',
    switchAuth: options.switchAuth ?? 'authorize',
    fortilink: (options.fortilink ?? 'fortilink').trim(),
    switchGroup: (options.switchGroup ?? '').trim(),
    switchProfile: (options.switchProfile ?? '').trim(),
    accessProfile: (options.accessProfile ?? '').trim(),
    apAuth: options.apAuth ?? 'authorize',
    apProfile: (options.apProfile ?? '').trim(),
    apGroup: (options.apGroup ?? '').trim(),
  };
  const warnings: Warning[] = [];

  const hasSwitches = devices.some((d) => d.kind === 'switch');
  if (hasSwitches && !o.fortilink) {
    warnings.push({
      message:
        'no FortiLink interface set — a switch that is not connected yet cannot be pre-authorized without one',
    });
  }

  // ---- per-device values ----
  const planned: Planned[] = devices.map((device) => {
    const isAp = device.kind === 'ap';

    let comment = '';
    if (o.setComment) {
      const parts = [device.comment, o.bulkComment];
      if (o.keyInComment && device.cloudKey) parts.push(`FortiCloud key ${device.cloudKey}`);
      // FortiOS has no escape for a quote inside a comment worth relying on.
      comment = parts.filter(Boolean).join(' - ').replace(/"/g, "'");
      const max = isAp ? MAX_AP_LOCATION : MAX_SWITCH_DESCRIPTION;
      if (comment.length > max) {
        warnings.push({
          line: device.row,
          message: `${device.serial}: comment is ${comment.length} characters; a ${kindLabel(device.kind)} ${isAp ? 'location' : 'description'} holds ${max} — cut short`,
        });
        comment = comment.slice(0, max).trimEnd();
      }
    }

    if (o.setName && device.name.length > MAX_NAME) {
      warnings.push({
        line: device.row,
        message: `${device.serial}: name "${device.name}" is ${device.name.length} characters; the limit is ${MAX_NAME}`,
      });
    }

    let profile = '';
    if (isAp) {
      profile = device.profile || o.apProfile;
      if (profile.includes('{model}')) {
        const model = apModelFromSerial(device.serial);
        if (model === null) {
          warnings.push({
            line: device.row,
            message: `${device.serial}: cannot read a FortiAP model from this serial, so no profile was set`,
          });
          profile = '';
        } else {
          profile = profile.replace(/\{model\}/g, model);
        }
      }
    }

    const group = device.group || (isAp ? o.apGroup : o.switchGroup);
    return { device, comment, group, profile };
  });

  // ---- group checks ----
  const groupNames = new Set<string>();
  const apGroupModels = new Map<string, Set<string>>();
  for (const p of planned) {
    if (!p.group) continue;
    if (p.group.length > MAX_GROUP_NAME && !groupNames.has(p.group)) {
      warnings.push({
        message: `group name "${p.group}" is ${p.group.length} characters; the limit is ${MAX_GROUP_NAME}`,
      });
    }
    groupNames.add(p.group);
    if (p.device.kind === 'ap') {
      const models = apGroupModels.get(p.group) ?? new Set<string>();
      models.add(apModelFromSerial(p.device.serial) ?? '?');
      apGroupModels.set(p.group, models);
    }
  }
  for (const [group, models] of apGroupModels) {
    if (models.size > 1) {
      warnings.push({
        message: `FortiAP group "${group}" would hold ${[...models].join(', ')} — a FortiAP group takes one model; split it with a Group column`,
      });
    }
  }

  // ---- batches ----
  const size = Number.isInteger(o.batchSize) && o.batchSize > 0 ? o.batchSize : planned.length || 1;
  const batches: Batch[] = [];
  for (let start = 0; start < planned.length; start += size) {
    const slice = planned.slice(start, start + size);
    batches.push({
      index: batches.length + 1,
      // With the group and profile each device actually got, so the
      // inventory export records what was configured.
      devices: slice.map((p) => ({ ...p.device, group: p.group, profile: p.profile })),
      output: emitBatch(slice, o) + '\n',
    });
  }

  if (o.memberMode === 'set' && batches.length > 1) {
    const seenIn = new Map<string, number>();
    const split = new Set<string>();
    for (const batch of batches) {
      for (const d of batch.devices) {
        if (!d.group) continue;
        const key = `${d.kind}:${d.group}`;
        const first = seenIn.get(key);
        if (first === undefined) seenIn.set(key, batch.index);
        else if (first !== batch.index) split.add(d.group);
      }
    }
    for (const group of split) {
      warnings.push({
        message: `group "${group}" spans more than one batch, and "set" replaces the members each time — only the last batch would remain. Use append, or one batch`,
      });
    }
  }

  return {
    batches,
    warnings,
    stats: {
      switches: devices.filter((d) => d.kind === 'switch').length,
      aps: devices.filter((d) => d.kind === 'ap').length,
    },
  };
}

type Resolved = Required<OnboardingOptions>;

function memberLines(mode: 'append' | 'set', field: string, serials: string[]): string[] {
  const quoted = serials.map((s) => `"${q(s)}"`);
  if (mode === 'set') return [`set ${field} ${quoted.join(' ')}`];
  const lines: string[] = [];
  for (let i = 0; i < quoted.length; i += MEMBERS_PER_LINE) {
    lines.push(`append ${field} ${quoted.slice(i, i + MEMBERS_PER_LINE).join(' ')}`);
  }
  return lines;
}

/** Group name → member serials, in first-seen order. */
function groupsOf(items: Planned[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const p of items) {
    if (!p.group) continue;
    const members = groups.get(p.group) ?? [];
    members.push(p.device.serial);
    groups.set(p.group, members);
  }
  return groups;
}

function emitBatch(items: Planned[], o: Resolved): string {
  const lines: string[] = [];
  const switches = items.filter((p) => p.device.kind === 'switch');
  const aps = items.filter((p) => p.device.kind === 'ap');

  if (switches.length) {
    lines.push('config switch-controller managed-switch');
    for (const p of switches) {
      lines.push(indent(1, `edit "${q(p.device.serial)}"`));
      if (o.setName && p.device.name) lines.push(indent(2, `set name "${q(p.device.name)}"`));
      if (p.comment) lines.push(indent(2, `set description "${q(p.comment)}"`));
      // The peer has to be known before a switch that has never connected
      // can be authorized.
      if (o.fortilink) lines.push(indent(2, `set fsw-wan1-peer "${q(o.fortilink)}"`));
      if (o.switchAuth !== 'keep') {
        lines.push(indent(2, `set fsw-wan1-admin ${AUTH_VALUE[o.switchAuth]}`));
      }
      if (o.switchProfile) lines.push(indent(2, `set switch-profile "${q(o.switchProfile)}"`));
      if (o.accessProfile) lines.push(indent(2, `set access-profile "${q(o.accessProfile)}"`));
      lines.push(indent(1, 'next'));
    }
    lines.push('end');

    const groups = groupsOf(switches);
    if (groups.size) {
      lines.push('config switch-controller switch-group');
      for (const [name, serials] of groups) {
        lines.push(indent(1, `edit "${q(name)}"`));
        if (o.fortilink) lines.push(indent(2, `set fortilink "${q(o.fortilink)}"`));
        for (const l of memberLines(o.memberMode, 'members', serials)) lines.push(indent(2, l));
        lines.push(indent(1, 'next'));
      }
      lines.push('end');
    }
  }

  if (aps.length) {
    lines.push('config wireless-controller wtp');
    for (const p of aps) {
      lines.push(indent(1, `edit "${q(p.device.serial)}"`));
      if (o.apAuth !== 'keep') lines.push(indent(2, `set admin ${AUTH_VALUE[o.apAuth]}`));
      if (o.setName && p.device.name) lines.push(indent(2, `set name "${q(p.device.name)}"`));
      if (p.comment) lines.push(indent(2, `set location "${q(p.comment)}"`));
      if (p.profile) lines.push(indent(2, `set wtp-profile "${q(p.profile)}"`));
      lines.push(indent(1, 'next'));
    }
    lines.push('end');

    // After the wtp block: a group can only list APs that already exist.
    const groups = groupsOf(aps);
    if (groups.size) {
      lines.push('config wireless-controller wtp-group');
      for (const [name, serials] of groups) {
        lines.push(indent(1, `edit "${q(name)}"`));
        // The platform has to be set before members of that model go in.
        const model = apModelFromSerial(serials[0]);
        if (model) lines.push(indent(2, `set platform-type ${model}`));
        for (const l of memberLines(o.memberMode, 'wtps', serials)) lines.push(indent(2, l));
        lines.push(indent(1, 'next'));
      }
      lines.push('end');
    }
  }

  return lines.join('\n');
}

/** Every batch in one text, each under a `#` comment line the CLI ignores. */
export function joinBatches(batches: Batch[]): string {
  if (batches.length === 1) return batches[0].output;
  return batches
    .map((b) => `# --- Batch ${b.index} of ${batches.length} (${b.devices.length} devices) ---\n${b.output}`)
    .join('\n');
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The device list as CSV, with the batch each device landed in — the
 * record of what was added, FortiCloud keys included.
 */
export function inventoryCsv(batches: Batch[]): string {
  const rows = [['Batch', 'Type', 'Serial Number', 'Name', 'Comments', 'FortiCloud Key', 'Group', 'Profile']];
  for (const b of batches) {
    for (const d of b.devices) {
      rows.push([
        String(b.index),
        kindLabel(d.kind),
        d.serial,
        d.name,
        d.comment,
        d.cloudKey,
        d.group,
        d.profile,
      ]);
    }
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
