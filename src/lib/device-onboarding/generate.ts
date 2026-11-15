import type { Warning } from '../../types';
import { apModelFromSerial } from './devices';
import type { Device, DeviceKind } from './devices';
import type { ExistingAp, ExistingGroup, ExistingState, ExistingSwitch } from './state';

/**
 * FortiGate config for a list of FortiSwitches and FortiAPs: one
 * `managed-switch` / `wtp` entry per device, plus the group membership,
 * cut into batches small enough to paste.
 */

/**
 * What to do with the device's authorization.
 *
 * - `authorize`: `enable`: approve it (or pre-approve it before it is plugged in)
 * - `reject`:    `disable`: refuse it
 * - `discovered`: back to waiting for approval
 * - `keep`:      emit no authorization line
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
/** A named switch ID: 16 characters in the FortiOS 7.4 CLI reference; later builds take 35. */
export const MAX_SWITCH_ID_EARLY = 16;

/**
 * How a switch gets its name.
 *
 * - `set-name`:     `edit <serial>` + `set name`. FortiOS 7.2 and earlier;
 *                   7.4 dropped `name` and made the ID itself the name.
 * - `rename`:       `rename <serial> to <name>`, for switches the FortiGate
 *                   already lists. FortiOS 7.4 and later.
 * - `preconfigure`: `edit <name>` + `set sn <serial>`, for switches that
 *                   have not connected yet. FortiOS 7.4 and later.
 * - `none`:         keep the serial as the ID and set no name.
 *
 * When the FortiGate's current config is supplied, `rename` and
 * `preconfigure` mean the same thing: each switch is renamed if it is
 * there and pre-configured if it is not.
 */
export type SwitchNaming = 'set-name' | 'rename' | 'preconfigure' | 'none';

/** Serials per `append members` line, so no pasted line runs long. */
const MEMBERS_PER_LINE = 8;

export interface OnboardingOptions {
  /** Devices per batch; 0 puts everything in one. Default 50. */
  batchSize?: number;

  /** Use the Name column. Default true. */
  setName?: boolean;
  /** Emit the Comments column: `description` on a switch, `location` on an AP. Default true. */
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

  /** How a switch gets its name. FortiAPs always use `set name`. Default 'rename'. */
  switchNaming?: SwitchNaming;
  /** `set fsw-wan1-admin ...`. Default 'authorize'. */
  switchAuth?: AuthAction;
  /** FortiLink interface: `set fsw-wan1-peer` and the group's `set fortilink`. Default 'fortilink'. */
  fortilink?: string;
  /** Switch group for rows without their own. Default '' (none). */
  switchGroup?: string;
  /** `set switch-profile ...`. Default '' (leave alone). */
  switchProfile?: string;
  /** `set access-profile ...`. Default '' (leave alone). */
  accessProfile?: string;

  /** `set admin ...`. Default 'authorize'. */
  apAuth?: AuthAction;
  /**
   * FortiAP profile for rows without their own. `{model}` becomes the
   * model read from the serial, so `FAP{model}-default` gives each AP its
   * model's default profile. Default '' (leave alone).
   */
  apProfile?: string;
  /** FortiAP group for rows without their own. Default '' (none). */
  apGroup?: string;

  /**
   * Name for switches whose row has none, built from a pattern:
   *
   * - `{n}`      counts the pattern-named switches from `nameStart`
   * - `{gn}`     counts within the device's group
   * - `{n:2}`    pads either counter with zeros: 01, 02, ...
   * - `{serial}` `{last4}` the serial number, or its last four characters
   * - `{model}`  the model read from the serial: 248EP, 231F
   * - `{group}`  the device's group
   *
   * Default '' (rows with no name stay unnamed).
   */
  switchNamePattern?: string;
  /** The same for FortiAPs, which count separately. Default ''. */
  apNamePattern?: string;
  /** First value of `{n}` and `{gn}`. Default 1. */
  nameStart?: number;
}

/**
 * Where a device stands against the FortiGate's current config.
 *
 * - `new`:    not on the FortiGate (or no current config was supplied)
 * - `change`: there, but something in the list differs
 * - `done`:   there, and already as the list wants it
 */
export type DeviceStatus = 'new' | 'change' | 'done';

export interface DevicePlan {
  device: Device;
  status: DeviceStatus;
  /** What will be set, for a `change`: 'name', 'description', 'group', ... */
  changes: string[];
  /** Batch the device's config is in; null when it is `done`. */
  batch: number | null;
}

export interface Batch {
  /** 1-based. */
  index: number;
  devices: Device[];
  /** Config for this batch, ending in a newline. */
  output: string;
}

/** Something on the FortiGate that the list does not mention. */
export interface Unlisted {
  kind: DeviceKind;
  id: string;
  serial: string;
}

export interface OnboardingResult {
  batches: Batch[];
  /** Every device of the list, in input order, with its status. */
  plan: DevicePlan[];
  /** Switches and APs on the FortiGate that are not in the list. */
  unlisted: Unlisted[];
  warnings: Warning[];
  stats: { switches: number; aps: number; fresh: number; changed: number; done: number };
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
  group: string;
  profile: string;
  /** The `edit` key: the serial, or a switch's name. */
  id: string;
  /** The ID to rename from, when the entry is renamed to `id`. */
  renameFrom: string | null;
  /** `set` lines for the entry, unindented; only what is not already so. */
  lines: string[];
  /** True when the device still has to be added to `group`. */
  joinGroup: boolean;
  status: DeviceStatus;
  changes: string[];
}

/** One wanted setting: its `set` line, its label, and the value in place now. */
type Want = [line: string, label: string, current: string | null, wanted: string];

const sameText = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Generate the batched config. Warnings about a device carry its input
 * row; the device list itself is validated by `readDevices`.
 *
 * With `existing` (the FortiGate's current config, from
 * `parseExistingState`), only what differs is emitted: a device already as
 * the list wants it is left out, one that differs gets just the lines that
 * differ, and a group only gains the members it is missing. A section that
 * was not supplied is treated as unknown, so everything for it is emitted.
 */
export function generateOnboarding(
  devices: Device[],
  options: OnboardingOptions = {},
  existing: ExistingState | null = null,
): OnboardingResult {
  const o: Resolved = {
    batchSize: options.batchSize ?? 50,
    setName: options.setName ?? true,
    setComment: options.setComment ?? true,
    bulkComment: (options.bulkComment ?? '').trim(),
    keyInComment: options.keyInComment ?? false,
    memberMode: options.memberMode ?? 'append',
    switchNaming: options.switchNaming ?? 'rename',
    switchAuth: options.switchAuth ?? 'authorize',
    fortilink: (options.fortilink ?? 'fortilink').trim(),
    switchGroup: (options.switchGroup ?? '').trim(),
    switchProfile: (options.switchProfile ?? '').trim(),
    accessProfile: (options.accessProfile ?? '').trim(),
    apAuth: options.apAuth ?? 'authorize',
    apProfile: (options.apProfile ?? '').trim(),
    apGroup: (options.apGroup ?? '').trim(),
    switchNamePattern: (options.switchNamePattern ?? '').trim(),
    apNamePattern: (options.apNamePattern ?? '').trim(),
    nameStart: options.nameStart ?? 1,
  };
  const naming: SwitchNaming = o.setName ? o.switchNaming : 'none';
  const warnings: Warning[] = [];
  if (o.setName) devices = nameFromPatterns(devices, o, warnings);

  const hasSwitches = devices.some((d) => d.kind === 'switch');
  if (hasSwitches && !o.fortilink) {
    warnings.push({
      message:
        'no FortiLink interface set: a switch that is not connected yet cannot be pre-authorized without one',
    });
  }
  if (
    existing?.namedSwitchIds &&
    naming === 'set-name' &&
    devices.some((d) => d.kind === 'switch' && d.name)
  ) {
    warnings.push({
      message:
        'this FortiGate keeps switch names as IDs (FortiOS 7.4 or later), where "set name" does not exist: change Switch names to rename',
    });
  }

  const switchBySerial = new Map<string, ExistingSwitch>();
  for (const sw of existing?.switches ?? []) switchBySerial.set(sw.serial, sw);
  const apBySerial = new Map<string, ExistingAp>();
  for (const ap of existing?.aps ?? []) apBySerial.set(ap.serial, ap);
  const knowSwitches = !!existing?.switches;
  const knowAps = !!existing?.aps;

  /** IDs taken on the FortiGate or by an earlier row, lower-cased. */
  const takenIds = new Map<string, string>();
  for (const sw of existing?.switches ?? []) takenIds.set(sw.id.toLowerCase(), sw.serial);

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
          message: `${device.serial}: comment is ${comment.length} characters; a ${kindLabel(device.kind)} ${isAp ? 'location' : 'description'} holds ${max}, cut short`,
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
    const wants: Want[] = [];
    let id = device.serial;
    let renameFrom: string | null = null;
    let known = false;
    let fresh = true;

    if (isAp) {
      const now = apBySerial.get(device.serial) ?? null;
      known = knowAps;
      fresh = now === null;
      if (o.apAuth !== 'keep') {
        const v = AUTH_VALUE[o.apAuth];
        wants.push([`set admin ${v}`, 'approval', now?.admin ?? null, v]);
      }
      if (o.setName && device.name) {
        wants.push([`set name "${q(device.name)}"`, 'name', now?.name ?? null, device.name]);
      }
      if (comment) {
        wants.push([`set location "${q(comment)}"`, 'location', now?.location ?? null, comment]);
      }
      if (profile) {
        wants.push([`set wtp-profile "${q(profile)}"`, 'profile', now?.profile ?? null, profile]);
      }
    } else {
      const now = switchBySerial.get(device.serial) ?? null;
      known = knowSwitches;
      fresh = now === null;
      if (now) id = now.id;

      const named = naming === 'rename' || naming === 'preconfigure';
      // A row with no name simply keeps the ID it has.
      if (named && device.name && !sameText(device.name, id)) {
        const holder = takenIds.get(device.name.toLowerCase());
        if (holder !== undefined && holder !== device.serial) {
          warnings.push({
            line: device.row,
            message: `${device.serial}: "${device.name}" is already the ID of ${holder}, so it keeps ${sameText(id, device.serial) ? 'its serial number as its' : `"${id}" as its`} ID`,
          });
        } else {
          if (!/^[A-Za-z0-9_-]+$/.test(device.name)) {
            warnings.push({
              line: device.row,
              message: `${device.serial}: "${device.name}" may be refused as a switch ID: FortiOS documents letters, digits, - and _ only`,
            });
          }
          if (device.name.length > MAX_SWITCH_ID_EARLY && device.name.length <= MAX_NAME) {
            warnings.push({
              line: device.row,
              kind: 'fix',
              message: `${device.serial}: "${device.name}" is ${device.name.length} characters, fine on current FortiOS (35), but FortiOS 7.4 documents ${MAX_SWITCH_ID_EARLY} for a switch ID`,
            });
          }
          // Known to be there, or assumed to be (rename without a current
          // config): rename it. Otherwise create it under its name.
          const there = knowSwitches ? now !== null : naming === 'rename';
          if (there) renameFrom = id;
          else wants.push([`set sn "${q(device.serial)}"`, 'serial', null, device.serial]);
          id = device.name;
        }
      }
      takenIds.set(id.toLowerCase(), device.serial);

      if (naming === 'set-name' && device.name) {
        wants.push([`set name "${q(device.name)}"`, 'name', now?.name ?? null, device.name]);
      }
      if (comment) {
        wants.push([
          `set description "${q(comment)}"`,
          'description',
          now?.description ?? null,
          comment,
        ]);
      }
      // The peer has to be known before a switch that has never connected
      // can be authorized.
      if (o.fortilink) {
        wants.push([
          `set fsw-wan1-peer "${q(o.fortilink)}"`,
          'FortiLink',
          now?.peer ?? null,
          o.fortilink,
        ]);
      }
      if (o.switchAuth !== 'keep') {
        const v = AUTH_VALUE[o.switchAuth];
        wants.push([`set fsw-wan1-admin ${v}`, 'approval', now?.admin ?? null, v]);
      }
      if (o.switchProfile) {
        wants.push([
          `set switch-profile "${q(o.switchProfile)}"`,
          'switch profile',
          now?.switchProfile ?? null,
          o.switchProfile,
        ]);
      }
      if (o.accessProfile) {
        wants.push([
          `set access-profile "${q(o.accessProfile)}"`,
          'access profile',
          now?.accessProfile ?? null,
          o.accessProfile,
        ]);
      }
    }

    const differing = wants.filter(([, , current, wanted]) => current === null || current !== wanted);
    const changes = differing.map(([, label]) => label);
    if (renameFrom !== null) changes.unshift('rename');
    const status: DeviceStatus = !known || fresh ? 'new' : 'change';
    return {
      device,
      group,
      profile,
      id,
      renameFrom,
      lines: differing.map(([line]) => line),
      joinGroup: group !== '',
      status,
      changes,
    };
  });

  // ---- group membership against what is there ----
  const groupIndex = (groups: ExistingGroup[] | null | undefined): Map<string, ExistingGroup> | null =>
    groups ? new Map(groups.map((g) => [g.name.toLowerCase(), g])) : null;
  const switchGroups = groupIndex(existing?.switchGroups);
  const apGroups = groupIndex(existing?.apGroups);
  for (const p of planned) {
    if (!p.group) continue;
    const index = p.device.kind === 'ap' ? apGroups : switchGroups;
    const members = index?.get(p.group.toLowerCase())?.members ?? [];
    const names = [p.id, p.device.serial, p.renameFrom ?? ''].filter(Boolean);
    if (index && members.some((m) => names.some((n) => sameText(m, n)))) p.joinGroup = false;
    else p.changes.push('group');
  }
  for (const p of planned) {
    if (p.status === 'change' && p.changes.length === 0) p.status = 'done';
    if (p.status === 'new') p.changes = [];
  }

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
      const platform = apGroups?.get(p.group.toLowerCase())?.platform;
      if (platform) models.add(platform);
      apGroupModels.set(p.group, models);
    }
  }
  for (const [group, models] of apGroupModels) {
    if (models.size > 1) {
      warnings.push({
        message: `FortiAP group "${group}" would hold ${[...models].join(', ')}: a FortiAP group takes one model; split it with a Group column`,
      });
    }
  }

  // ---- batches: only devices with something left to do ----
  const todo = planned.filter((p) => p.status !== 'done');
  const size = Number.isInteger(o.batchSize) && o.batchSize > 0 ? o.batchSize : todo.length || 1;
  const batches: Batch[] = [];
  const batchOf = new Map<Planned, number>();
  for (let start = 0; start < todo.length; start += size) {
    const slice = todo.slice(start, start + size);
    const index = batches.length + 1;
    for (const p of slice) batchOf.set(p, index);
    batches.push({
      index,
      // With the group and profile each device actually got, so the
      // inventory export records what was configured.
      devices: slice.map((p) => ({ ...p.device, group: p.group, profile: p.profile })),
      output: emitBatch(slice, o, { switchGroups, apGroups }) + '\n',
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
        message: `group "${group}" spans more than one batch, and "set" replaces the members each time: only the last batch would remain. Use append, or one batch`,
      });
    }
  }

  // ---- what the FortiGate has that the list does not ----
  const listed = new Set(devices.map((d) => d.serial));
  const unlisted: Unlisted[] = [
    ...(existing?.switches ?? [])
      .filter((sw) => !listed.has(sw.serial))
      .map((sw): Unlisted => ({ kind: 'switch', id: sw.id, serial: sw.serial })),
    ...(existing?.aps ?? [])
      .filter((ap) => !listed.has(ap.serial))
      .map((ap): Unlisted => ({ kind: 'ap', id: ap.serial, serial: ap.serial })),
  ];

  return {
    batches,
    plan: planned.map((p) => ({
      device: { ...p.device, group: p.group, profile: p.profile },
      status: p.status,
      changes: p.changes,
      batch: batchOf.get(p) ?? null,
    })),
    unlisted,
    warnings,
    stats: {
      switches: devices.filter((d) => d.kind === 'switch').length,
      aps: devices.filter((d) => d.kind === 'ap').length,
      fresh: planned.filter((p) => p.status === 'new').length,
      changed: planned.filter((p) => p.status === 'change').length,
      done: planned.filter((p) => p.status === 'done').length,
    },
  };
}

type Resolved = Required<OnboardingOptions>;

/** The model part of a serial: S248EP... -> 248EP, FS1E48... -> 1E48, FP231F... -> 231F. */
function modelFromSerial(device: Device): string {
  if (device.kind === 'ap') return apModelFromSerial(device.serial) ?? '';
  return device.serial.startsWith('FS') ? device.serial.slice(2, 6) : device.serial.slice(1, 6);
}

const PLACEHOLDER = /\{([A-Za-z0-9]+)(?::(\d+))?\}/g;

/**
 * Give every device with no name one built from its kind's pattern. Rows
 * that have a name are left alone and do not use up a number.
 */
function nameFromPatterns(devices: Device[], o: Resolved, warnings: Warning[]): Device[] {
  if (!o.switchNamePattern && !o.apNamePattern) return devices;
  const start = Number.isInteger(o.nameStart) ? o.nameStart : 1;
  const counters = new Map<string, number>();
  const next = (key: string): number => {
    const n = counters.get(key) ?? start;
    counters.set(key, n + 1);
    return n;
  };
  const unknown = new Set<string>();
  const used = new Map<string, number>();
  for (const d of devices) {
    if (d.name) used.set(`${d.kind}:${d.name.toLowerCase()}`, d.row);
  }

  const named = devices.map((device) => {
    const pattern = device.kind === 'ap' ? o.apNamePattern : o.switchNamePattern;
    if (device.name || !pattern) return device;
    const group = device.group || (device.kind === 'ap' ? o.apGroup : o.switchGroup);
    // A counter only advances when the pattern uses it.
    const n = /\{n(:\d+)?\}/.test(pattern) ? next(device.kind) : 0;
    const gn = /\{gn(:\d+)?\}/.test(pattern) ? next(`${device.kind}:${group.toLowerCase()}`) : 0;
    const name = pattern
      .replace(PLACEHOLDER, (whole, key: string, width?: string) => {
        const pad = (value: number): string => String(value).padStart(Number(width ?? 0), '0');
        switch (key) {
          case 'n':
            return pad(n);
          case 'gn':
            return pad(gn);
          case 'serial':
            return device.serial;
          case 'last4':
            return device.serial.slice(-4);
          case 'model':
            return modelFromSerial(device);
          case 'group':
            return group;
          default:
            unknown.add(whole);
            return whole;
        }
      })
      // The same characters readDevices strips from a typed name.
      .replace(/[()<>'#"]/g, '')
      .trim();

    const key = `${device.kind}:${name.toLowerCase()}`;
    const other = used.get(key);
    if (other !== undefined) {
      warnings.push({
        line: device.row,
        message: `${device.serial}: the name pattern gives "${name}", which row ${other} already has`,
      });
    } else {
      used.set(key, device.row);
    }
    return { ...device, name };
  });

  for (const placeholder of unknown) {
    warnings.push({
      message: `name pattern: ${placeholder} is not a placeholder, so it is kept as typed. Use {n}, {gn}, {serial}, {last4}, {model}, or {group}`,
    });
  }
  return named;
}

interface KnownGroups {
  switchGroups: Map<string, ExistingGroup> | null;
  apGroups: Map<string, ExistingGroup> | null;
}

function memberLines(mode: 'append' | 'set', field: string, ids: string[]): string[] {
  const quoted = ids.map((s) => `"${q(s)}"`);
  if (mode === 'set') return [`set ${field} ${quoted.join(' ')}`];
  const lines: string[] = [];
  for (let i = 0; i < quoted.length; i += MEMBERS_PER_LINE) {
    lines.push(`append ${field} ${quoted.slice(i, i + MEMBERS_PER_LINE).join(' ')}`);
  }
  return lines;
}

/** Group name -> the IDs still to be added to it, in first-seen order. */
function groupsOf(items: Planned[]): Map<string, Planned[]> {
  const groups = new Map<string, Planned[]>();
  for (const p of items) {
    if (!p.group || !p.joinGroup) continue;
    const members = groups.get(p.group) ?? [];
    members.push(p);
    groups.set(p.group, members);
  }
  return groups;
}

function emitBatch(items: Planned[], o: Resolved, known: KnownGroups): string {
  const lines: string[] = [];
  const switches = items.filter((p) => p.device.kind === 'switch');
  const aps = items.filter((p) => p.device.kind === 'ap');

  /** One `config <path>` block of `edit` entries, skipped when nothing is in it. */
  const entryBlock = (path: string, entries: Planned[], renames: boolean): void => {
    const body: string[] = [];
    // Renames first, so every edit below finds its entry under the new ID.
    if (renames) {
      for (const p of entries) {
        if (p.renameFrom !== null) {
          body.push(indent(1, `rename "${q(p.renameFrom)}" to "${q(p.id)}"`));
        }
      }
    }
    for (const p of entries) {
      if (!p.lines.length) continue;
      body.push(indent(1, `edit "${q(p.id)}"`));
      for (const line of p.lines) body.push(indent(2, line));
      body.push(indent(1, 'next'));
    }
    if (body.length) lines.push(`config ${path}`, ...body, 'end');
  };

  entryBlock('switch-controller managed-switch', switches, true);
  const switchGroups = groupsOf(switches);
  if (switchGroups.size) {
    lines.push('config switch-controller switch-group');
    for (const [name, members] of switchGroups) {
      lines.push(indent(1, `edit "${q(name)}"`));
      const now = known.switchGroups?.get(name.toLowerCase());
      if (o.fortilink && now?.fortilink !== o.fortilink) {
        lines.push(indent(2, `set fortilink "${q(o.fortilink)}"`));
      }
      const ids = members.map((p) => p.id);
      for (const l of memberLines(o.memberMode, 'members', ids)) lines.push(indent(2, l));
      lines.push(indent(1, 'next'));
    }
    lines.push('end');
  }

  entryBlock('wireless-controller wtp', aps, false);
  // After the wtp block: a group can only list APs that already exist.
  const apGroups = groupsOf(aps);
  if (apGroups.size) {
    lines.push('config wireless-controller wtp-group');
    for (const [name, members] of apGroups) {
      lines.push(indent(1, `edit "${q(name)}"`));
      // The platform has to be set before members of that model go in.
      const model = apModelFromSerial(members[0].device.serial);
      const now = known.apGroups?.get(name.toLowerCase());
      if (model && now?.platform !== model) lines.push(indent(2, `set platform-type ${model}`));
      const ids = members.map((p) => p.device.serial);
      for (const l of memberLines(o.memberMode, 'wtps', ids)) lines.push(indent(2, l));
      lines.push(indent(1, 'next'));
    }
    lines.push('end');
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
 * The device list as CSV, with the batch each device landed in: the
 * record of what was added, FortiCloud keys included.
 */
export function inventoryCsv(batches: Batch[], done: Device[] = []): string {
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
  // Devices the FortiGate already had as wanted are in no batch.
  for (const d of done) {
    rows.push(['done', kindLabel(d.kind), d.serial, d.name, d.comment, d.cloudKey, d.group, d.profile]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
