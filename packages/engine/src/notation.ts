/**
 * Shorthand notation for tests and logs: digits followed by a suit letter.
 *   m = Characters, p = Dots, s = Bamboo, z = honors (1-4 winds E S W N, 5-7 dragons White Green Red)
 * Example: "123m456p789s11z"
 */
import { Kind, Tile, kindOf } from './tiles';

const SUIT_OFFSET: Record<string, number> = { m: 0, p: 9, s: 18, z: 27 };
const SUIT_LETTERS = ['m', 'p', 's', 'z'] as const;

/** Parse shorthand into a list of kinds (in the order written). Throws on bad input. */
export function parseKinds(text: string): Kind[] {
  const kinds: Kind[] = [];
  let pending: number[] = [];
  for (const ch of text.replace(/\s+/g, '')) {
    if (ch >= '0' && ch <= '9') {
      pending.push(Number(ch));
    } else if (ch in SUIT_OFFSET) {
      if (pending.length === 0) throw new Error(`Suit letter "${ch}" without digits in "${text}"`);
      for (const d of pending) {
        const max = ch === 'z' ? 7 : 9;
        if (d < 1 || d > max) throw new Error(`Bad rank ${d}${ch} in "${text}"`);
        kinds.push(SUIT_OFFSET[ch] + d - 1);
      }
      pending = [];
    } else {
      throw new Error(`Unexpected character "${ch}" in "${text}"`);
    }
  }
  if (pending.length) throw new Error(`Digits without a suit letter at the end of "${text}"`);
  return kinds;
}

/**
 * Parse shorthand into physical tile ids, picking unused copies of each kind.
 * Throws if a kind appears more than 4 times.
 */
export function parseTiles(text: string): Tile[] {
  const used = new Array<number>(34).fill(0);
  return parseKinds(text).map((k) => {
    if (used[k] >= 4) throw new Error(`More than 4 copies of kind ${k} in "${text}"`);
    return k * 4 + used[k]++;
  });
}

/** Format kinds back into compact shorthand, grouped by suit in sorted order. */
export function formatKinds(kinds: readonly Kind[]): string {
  const sorted = [...kinds].sort((a, b) => a - b);
  let out = '';
  for (let s = 0; s < 4; s++) {
    const digits = sorted.filter((k) => Math.floor(k / 9) === s && (s < 3 || k >= 27)).map((k) => k - s * 9 + 1);
    if (s === 3) {
      const honors = sorted.filter((k) => k >= 27).map((k) => k - 27 + 1);
      if (honors.length) out += honors.join('') + 'z';
    } else if (digits.length) {
      out += digits.join('') + SUIT_LETTERS[s];
    }
  }
  return out;
}

export const formatTiles = (tiles: readonly Tile[]): string => formatKinds(tiles.map(kindOf));
