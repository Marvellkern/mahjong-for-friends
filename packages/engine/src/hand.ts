/**
 * Win detection: the one function that must be perfect.
 *
 * Ruleset: a winning hand is exactly 4 sets + 1 pair. Nothing else.
 *   - set  = chow (3 in a row, same numbered suit, no wrapping) or pung (3 identical).
 *   - A kong is 4 identical tiles but counts as ONE set; kongs are always
 *     declared as melds, so they never appear inside the concealed counts here.
 *   - Seven pairs, thirteen orphans etc. are NOT wins in this ruleset.
 *
 * All functions work on a 34-slot count array (counts[kind] = how many of that kind).
 */
import { KIND_COUNT, Kind } from './tiles';

/**
 * Can these concealed tiles (INCLUDING the winning tile) complete the hand?
 *
 * @param counts    concealed tiles as a 34-slot count array. NOT modified (we restore everything we touch).
 * @param openMelds how many sets are already declared as melds (open or concealed kongs). Each counts as one set.
 */
export function canWin(counts: number[], openMelds: number): boolean {
  const setsNeeded = 4 - openMelds;
  if (setsNeeded < 0) return false;
  let total = 0;
  for (let i = 0; i < KIND_COUNT; i++) total += counts[i];
  // A complete hand is always (sets * 3) + 2 concealed tiles. Any other size cannot win.
  if (total !== 3 * setsNeeded + 2) return false;

  // Try every possible pair, then see if the rest splits into sets.
  for (let pair = 0; pair < KIND_COUNT; pair++) {
    if (counts[pair] >= 2) {
      counts[pair] -= 2;
      const ok = decompose(counts, 0);
      counts[pair] += 2;
      if (ok) return true;
    }
  }
  return false;
}

/**
 * Can counts[i..33] be split entirely into sets (pungs and chows)?
 *
 * Always work on the LOWEST remaining kind: that tile must be the start of
 * either a pung or a chow (nothing lower is left to pair it with), so we only
 * ever have two branches to try. This keeps the search tiny.
 */
function decompose(counts: number[], i: number): boolean {
  while (i < KIND_COUNT && counts[i] === 0) i++;
  if (i === KIND_COUNT) return true; // everything used up

  // Option 1: pung of this kind.
  if (counts[i] >= 3) {
    counts[i] -= 3;
    const ok = decompose(counts, i);
    counts[i] += 3;
    if (ok) return true;
  }
  // Option 2: chow starting here. Suits only (i < 27), and the start rank must be
  // 1..7 (i % 9 <= 6) so the run can't wrap from 9 into the next suit.
  if (i < 27 && i % 9 <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
    counts[i]--;
    counts[i + 1]--;
    counts[i + 2]--;
    const ok = decompose(counts, i);
    counts[i]++;
    counts[i + 1]++;
    counts[i + 2]++;
    if (ok) return true;
  }
  return false;
}

/**
 * Ready-hand check: which tile kinds would complete this hand?
 *
 * @param concealed  counts of the concealed hand WITHOUT a winning tile (3n+1 tiles).
 * @param openMelds  number of declared melds.
 * @param visibleOwn counts of tiles the player can see they own in melds (so we skip kinds
 *                   where all 4 copies are already in the player's own hand + melds).
 */
export function waits(concealed: number[], openMelds: number, visibleOwn?: number[]): Kind[] {
  const result: Kind[] = [];
  for (let k = 0; k < KIND_COUNT; k++) {
    const owned = concealed[k] + (visibleOwn ? visibleOwn[k] : 0);
    if (owned >= 4) continue; // can't draw a 5th copy
    concealed[k]++;
    if (canWin(concealed, openMelds)) result.push(k);
    concealed[k]--;
  }
  return result;
}
