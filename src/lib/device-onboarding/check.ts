import type { Device } from './devices';
import { generateOnboarding } from './generate';
import type { Batch, OnboardingOptions, OnboardingResult } from './generate';
import type { ExistingState } from './state';

/**
 * Checking that a pasted batch took: the `show` commands to run after it,
 * and a comparison of their output against what the batch was meant to do.
 */

const SECTIONS: { path: string; command: string }[] = [
  { path: 'switch-controller managed-switch', command: 'show switch-controller managed-switch' },
  { path: 'switch-controller switch-group', command: 'show switch-controller switch-group' },
  { path: 'wireless-controller wtp', command: 'show wireless-controller wtp' },
  { path: 'wireless-controller wtp-group', command: 'show wireless-controller wtp-group' },
];

/** The `show` commands that cover what this batch writes, and nothing else. */
export function checkCommands(batch: Batch): string[] {
  const written = new Set(
    batch.output
      .split('\n')
      .filter((line) => line.startsWith('config '))
      .map((line) => line.slice('config '.length)),
  );
  return SECTIONS.filter((s) => written.has(s.path)).map((s) => s.command);
}

/**
 * - `confirmed`: the FortiGate now has the device as the list wants it
 * - `pending`:   it is missing, or something still differs
 * - `unchecked`: the pasted output does not cover it
 */
export type CheckState = 'confirmed' | 'pending' | 'unchecked';

export interface DeviceCheck {
  device: Device;
  state: CheckState;
  /** What is still wrong, or which output is missing; '' when confirmed. */
  detail: string;
}

export interface BatchCheck {
  /** The batch's 1-based index. */
  index: number;
  devices: DeviceCheck[];
  confirmed: number;
  pending: number;
  unchecked: number;
}

/**
 * Compare each batch of `result` with what the FortiGate shows after the
 * batch was pasted. `devices` and `options` are the ones `result` was
 * generated from; `shown` is the parsed output of the check commands.
 *
 * The batches themselves are not regenerated, so their numbering holds
 * still while they are ticked off one by one.
 */
export function checkBatches(
  devices: Device[],
  options: OnboardingOptions,
  result: OnboardingResult,
  shown: ExistingState,
): BatchCheck[] {
  const after = generateOnboarding(devices, options, shown);
  const bySerial = new Map(after.plan.map((p) => [p.device.serial, p]));

  return result.batches.map((batch) => {
    const checks = batch.devices.map((device): DeviceCheck => {
      const isAp = device.kind === 'ap';
      const entries = isAp ? shown.aps : shown.switches;
      const groups = isAp ? shown.apGroups : shown.switchGroups;
      const entryCommand = isAp ? SECTIONS[2].command : SECTIONS[0].command;
      const groupCommand = isAp ? SECTIONS[3].command : SECTIONS[1].command;
      if (!entries) {
        return { device, state: 'unchecked', detail: `no output of "${entryCommand}"` };
      }

      const now = bySerial.get(device.serial);
      if (!now || now.status === 'new') {
        return { device, state: 'pending', detail: 'not on the FortiGate' };
      }
      if (now.status === 'done') return { device, state: 'confirmed', detail: '' };

      // With no group output, "still has to join its group" is not a
      // finding: it is simply not known.
      const differs = groups ? now.changes : now.changes.filter((c) => c !== 'group');
      if (differs.length) {
        return { device, state: 'pending', detail: `still differs: ${differs.join(', ')}` };
      }
      return { device, state: 'unchecked', detail: `group not checked: no output of "${groupCommand}"` };
    });

    const count = (state: CheckState): number => checks.filter((c) => c.state === state).length;
    return {
      index: batch.index,
      devices: checks,
      confirmed: count('confirmed'),
      pending: count('pending'),
      unchecked: count('unchecked'),
    };
  });
}
