/** Helpers for finding and building melds from a hand. */
import { Kind, Tile, countsFromTiles, isSuited, kindOf } from './tiles';
import type { Meld } from './types';

/**
 * Every chow the given discard could complete, as sorted kind triples.
 * Rules: numbered suits only, all three in the same suit, no wrapping (8-9-1 is not a chow).
 */
export function chowOptions(hand: readonly Tile[], discardKind: Kind): Kind[][] {
  if (!isSuited(discardKind)) return [];
  const counts = countsFromTiles(hand);
  const suitStart = Math.floor(discardKind / 9) * 9;
  const options: Kind[][] = [];
  // The discard can be the low, middle, or high tile of the run.
  for (let start = discardKind - 2; start <= discardKind; start++) {
    if (start < suitStart || start + 2 > suitStart + 8) continue; // run must stay inside this suit
    const run = [start, start + 1, start + 2];
    const needed = run.filter((k) => k !== discardKind);
    if (needed.every((k) => counts[k] > 0)) options.push(run);
  }
  return options;
}

/** Remove one tile of each given kind from the hand. Returns the removed tiles. Throws if missing. */
export function takeKinds(hand: Tile[], kinds: readonly Kind[]): Tile[] {
  const taken: Tile[] = [];
  for (const k of kinds) {
    const idx = hand.findIndex((t) => kindOf(t) === k);
    if (idx < 0) throw new Error(`Hand is missing kind ${k}`);
    taken.push(hand.splice(idx, 1)[0]);
  }
  return taken;
}

/** Counts of tiles locked in melds, for "already own all 4 copies" checks. */
export function meldCounts(melds: readonly Meld[]): number[] {
  return countsFromTiles(melds.flatMap((m) => m.tiles));
}
