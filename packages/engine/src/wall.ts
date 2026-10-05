/**
 * Seeded randomness and the wall.
 *
 * The engine never calls Math.random. All randomness comes from a small
 * deterministic generator (mulberry32) whose state is a single 32-bit integer.
 * The game state stores that integer, so the reducer stays pure and every game
 * can be replayed from its seed.
 */
import { Tile, TILE_COUNT } from './tiles';

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Current internal state; pass it to createRng() to continue the sequence. */
  readonly state: number;
}

/** mulberry32: tiny, fast, good enough for shuffling tiles. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    get state() {
      return s;
    },
  };
}

/** Fisher-Yates shuffle (returns a new array). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A freshly shuffled wall of all 136 tiles. Index 0 is drawn first; kong replacements come from the end. */
export function buildWall(rng: Rng): Tile[] {
  return shuffle(
    Array.from({ length: TILE_COUNT }, (_, i) => i),
    rng,
  );
}

/** Roll n six-sided dice. */
export function rollDice(rng: Rng, n = 2): number[] {
  return Array.from({ length: n }, () => rng.int(6) + 1);
}
