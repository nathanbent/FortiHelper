/**
 * FortiGate color ID table (IDs 1-32), from input-ideas/notes/colors.md.
 *
 * The hex values are approximate visual hints for the UI swatch only —
 * FortiOS stores just the numeric ID (`set color <id>`), so the emitted
 * config is unaffected by these values.
 */
export interface FortiColor {
  id: number;
  name: string;
  hex: string;
}

export const FORTI_COLORS: FortiColor[] = [
  { id: 1, name: 'Black', hex: '#000000' },
  { id: 2, name: 'Deep blue', hex: '#16437e' },
  { id: 3, name: 'Medium green', hex: '#3f9e4d' },
  { id: 4, name: 'Dark red', hex: '#8b1a1a' },
  { id: 5, name: 'Light red', hex: '#e86c6c' },
  { id: 6, name: 'Bright red', hex: '#e5342c' },
  { id: 7, name: 'Dark red', hex: '#a52a2a' },
  { id: 8, name: 'Dark orange', hex: '#cc5f00' },
  { id: 9, name: 'Orange', hex: '#f28c28' },
  { id: 10, name: 'Yellow', hex: '#f2d21f' },
  { id: 11, name: 'Dark yellow', hex: '#b8a119' },
  { id: 12, name: 'Brown', hex: '#8b5a2b' },
  { id: 13, name: 'Bright green', hex: '#3ad43a' },
  { id: 14, name: 'Muted green', hex: '#7aa874' },
  { id: 15, name: 'Dark green', hex: '#206b32' },
  { id: 16, name: 'Deep green', hex: '#0e4d24' },
  { id: 17, name: 'Cyan blue', hex: '#1d9fb0' },
  { id: 18, name: 'Light blue', hex: '#7ec8e3' },
  { id: 19, name: 'Royal blue', hex: '#2b60de' },
  { id: 20, name: 'Indigo', hex: '#4b0082' },
  { id: 21, name: 'Purple', hex: '#800080' },
  { id: 22, name: 'Violet', hex: '#8f5fe8' },
  { id: 23, name: 'Magenta', hex: '#d02090' },
  { id: 24, name: 'Dark pink', hex: '#c2185b' },
  { id: 25, name: 'Maroon', hex: '#800000' },
  { id: 26, name: 'Light gray', hex: '#c8c8c8' },
  { id: 27, name: 'Dark gray', hex: '#555555' },
  { id: 28, name: 'Light orange', hex: '#ffb347' },
  { id: 29, name: 'Tan', hex: '#d2b48c' },
  { id: 30, name: 'Blue gray', hex: '#7393b3' },
  { id: 31, name: 'Lavender', hex: '#b57edc' },
  { id: 32, name: 'Olive gray', hex: '#8a8a5c' },
];

/** Name for a FortiGate color ID, or undefined for unknown ids. */
export function colorName(id: number): string | undefined {
  return FORTI_COLORS.find((c) => c.id === id)?.name;
}

/** Approximate hex for a FortiGate color ID, or undefined for unknown ids. */
export function colorHex(id: number): string | undefined {
  return FORTI_COLORS.find((c) => c.id === id)?.hex;
}
