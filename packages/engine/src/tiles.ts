/**
 * Tile model.
 *
 * - A tile KIND is an integer 0..33:
 *     0..8   Characters 1-9 (萬)   shorthand 1m..9m
 *     9..17  Dots 1-9 (筒)         shorthand 1p..9p
 *     18..26 Bamboo 1-9 (條)       shorthand 1s..9s
 *     27..30 Winds E S W N         shorthand 1z..4z
 *     31..33 Dragons White Green Red  shorthand 5z..7z
 * - A physical TILE is identified by an id 0..135, and kind = floor(id / 4).
 *   Ids let the UI track/animate one specific tile.
 */

/** Physical tile id, 0..135. */
export type Tile = number;
/** Tile kind, 0..33. */
export type Kind = number;

export const KIND_COUNT = 34;
export const TILE_COUNT = 136;
export const COPIES = 4;

export type Suit = 'man' | 'pin' | 'sou' | 'wind' | 'dragon';

export const kindOf = (tile: Tile): Kind => Math.floor(tile / COPIES);

export function suitOf(kind: Kind): Suit {
  if (kind < 9) return 'man';
  if (kind < 18) return 'pin';
  if (kind < 27) return 'sou';
  if (kind < 31) return 'wind';
  return 'dragon';
}

/** True for the three numbered suits (chow-able). */
export const isSuited = (kind: Kind): boolean => kind < 27;
export const isHonor = (kind: Kind): boolean => kind >= 27;
/** Rank 1..9 for suited kinds; 1..4 for winds; 1..3 for dragons. */
export function rankOf(kind: Kind): number {
  if (kind < 27) return (kind % 9) + 1;
  if (kind < 31) return kind - 27 + 1;
  return kind - 31 + 1;
}

const SUIT_NAMES: Record<'man' | 'pin' | 'sou', string> = { man: 'Characters', pin: 'Dots', sou: 'Bamboo' };
const WIND_NAMES = ['East', 'South', 'West', 'North'];
const DRAGON_NAMES = ['White', 'Green', 'Red'];

/** Human-readable English name, e.g. "3 of Dots", "East Wind", "Red Dragon". Used for aria-labels and logs. */
export function kindName(kind: Kind): string {
  const suit = suitOf(kind);
  if (suit === 'wind') return `${WIND_NAMES[kind - 27]} Wind`;
  if (suit === 'dragon') return `${DRAGON_NAMES[kind - 31]} Dragon`;
  return `${rankOf(kind)} of ${SUIT_NAMES[suit]}`;
}

/** Sort tiles by kind (man, pin, sou, winds, dragons), then id for stability. */
export function sortTiles(tiles: readonly Tile[]): Tile[] {
  return [...tiles].sort((a, b) => kindOf(a) - kindOf(b) || a - b);
}

/** Build a 34-slot count array from tile ids. */
export function countsFromTiles(tiles: readonly Tile[]): number[] {
  const counts = new Array<number>(KIND_COUNT).fill(0);
  for (const t of tiles) counts[kindOf(t)]++;
  return counts;
}

/** Build a 34-slot count array from kinds. */
export function countsFromKinds(kinds: readonly Kind[]): number[] {
  const counts = new Array<number>(KIND_COUNT).fill(0);
  for (const k of kinds) counts[k]++;
  return counts;
}
