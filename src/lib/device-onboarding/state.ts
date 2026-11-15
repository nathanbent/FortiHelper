import { entries, getSetting, parse, unq } from '../forti-edit/parser';
import type { ConfigBlock, Entry, Node } from '../forti-edit/types';

/**
 * What the FortiGate already has, read from pasted `show` output or a
 * config backup, so the generator can leave out what is already done.
 *
 * `show` prints only settings that differ from their defaults, so a
 * missing line means "the default", not "unknown": a managed switch with
 * no `fsw-wan1-admin` line is `discovered`, a FortiAP with no `admin` line
 * is `enable`.
 */

export interface ExistingSwitch {
  /** The `edit` key: the serial, or a name on FortiOS 7.4 and later. */
  id: string;
  /** Serial number: `set sn` when present, otherwise the ID. Upper-cased. */
  serial: string;
  /** `set name`, FortiOS 7.2 and earlier. */
  name: string;
  description: string;
  peer: string;
  admin: string;
  switchProfile: string;
  accessProfile: string;
}

export interface ExistingAp {
  /** The `edit` key, which is the serial. Upper-cased. */
  serial: string;
  admin: string;
  name: string;
  location: string;
  profile: string;
}

export interface ExistingGroup {
  name: string;
  members: string[];
  /** `set fortilink` on a switch group; '' on a FortiAP group. */
  fortilink: string;
  /** `set platform-type` on a FortiAP group; '' on a switch group. */
  platform: string;
}

/**
 * Each list is null when its section was not in the pasted text, which is
 * different from a section that was pasted and is empty.
 */
export interface ExistingState {
  switches: ExistingSwitch[] | null;
  aps: ExistingAp[] | null;
  switchGroups: ExistingGroup[] | null;
  apGroups: ExistingGroup[] | null;
  /**
   * True when a switch entry carries `set sn`: the FortiGate keeps switch
   * names as IDs (FortiOS 7.4 and later), where `set name` does not exist.
   */
  namedSwitchIds: boolean;
}

/** The `show` commands whose output this reads. */
export const STATE_COMMANDS = [
  'show switch-controller managed-switch',
  'show switch-controller switch-group',
  'show wireless-controller wtp',
  'show wireless-controller wtp-group',
];

const PATHS = {
  switches: 'switch-controller managed-switch',
  aps: 'wireless-controller wtp',
  switchGroups: 'switch-controller switch-group',
  apGroups: 'wireless-controller wtp-group',
} as const;

/**
 * Every block with the given path, at any depth. A multi-VDOM backup nests
 * the same section once per VDOM under `config vdom` / `edit <vdom>`.
 */
function collect(nodes: Node[], path: string, into: ConfigBlock[]): void {
  for (const node of nodes) {
    if (node.kind === 'config') {
      if (node.path === path) into.push(node);
      else collect(node.children, path, into);
    } else if (node.kind === 'entry') {
      collect(node.children, path, into);
    }
  }
}

function value(entry: Entry, name: string, fallback = ''): string {
  const setting = getSetting(entry, name);
  return setting && setting.values.length ? unq(setting.values[0]) : fallback;
}

function values(entry: Entry, name: string): string[] {
  return (getSetting(entry, name)?.values ?? []).map(unq);
}

/**
 * Read the switch and FortiAP sections out of pasted config. Returns null
 * when the text holds none of them.
 */
export function parseExistingState(text: string): ExistingState | null {
  if (!text.trim()) return null;
  const root = parse(text);
  const find = (path: string): Entry[] | null => {
    const blocks: ConfigBlock[] = [];
    collect(root.blocks, path, blocks);
    return blocks.length ? blocks.flatMap(entries) : null;
  };

  const switchEntries = find(PATHS.switches);
  const apEntries = find(PATHS.aps);
  const switchGroupEntries = find(PATHS.switchGroups);
  const apGroupEntries = find(PATHS.apGroups);
  if (!switchEntries && !apEntries && !switchGroupEntries && !apGroupEntries) return null;

  let namedSwitchIds = false;
  const switches =
    switchEntries?.map((e): ExistingSwitch => {
      const id = unq(e.key);
      const sn = value(e, 'sn');
      if (sn) namedSwitchIds = true;
      return {
        id,
        serial: (sn || id).toUpperCase(),
        name: value(e, 'name'),
        description: value(e, 'description'),
        peer: value(e, 'fsw-wan1-peer'),
        admin: value(e, 'fsw-wan1-admin', 'discovered'),
        switchProfile: value(e, 'switch-profile', 'default'),
        accessProfile: value(e, 'access-profile', 'default'),
      };
    }) ?? null;

  const aps =
    apEntries?.map(
      (e): ExistingAp => ({
        serial: unq(e.key).toUpperCase(),
        admin: value(e, 'admin', 'enable'),
        name: value(e, 'name'),
        location: value(e, 'location'),
        profile: value(e, 'wtp-profile'),
      }),
    ) ?? null;

  const group = (e: Entry, membersField: string): ExistingGroup => ({
    name: unq(e.key),
    members: values(e, membersField),
    fortilink: value(e, 'fortilink'),
    platform: value(e, 'platform-type'),
  });

  return {
    switches,
    aps,
    switchGroups: switchGroupEntries?.map((e) => group(e, 'members')) ?? null,
    apGroups: apGroupEntries?.map((e) => group(e, 'wtps')) ?? null,
    namedSwitchIds,
  };
}
