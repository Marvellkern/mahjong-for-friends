/**
 * v1 bots (brief section 5):
 *   - always declare a win when legal (self-draw or on a discard)
 *   - never claim anything except a win
 *   - discard the least useful tile:
 *       +2   per other copy of the same kind
 *       +1   per neighbour kind held at +-1 in the same suit
 *       +0.5 per neighbour kind held at +-2 in the same suit
 *     Lone honours score lowest; ties are broken randomly.
 */
import { legalActions } from './game';
import { Kind, Tile, countsFromTiles, isHonor, kindOf } from './tiles';
import type { Action, GameState } from './types';
import type { Rng } from './wall';

/** How useful a tile kind is in this hand (higher = keep it). */
export function tileUsefulness(counts: readonly number[], kind: Kind): number {
  let score = 2 * (counts[kind] - 1);
  if (isHonor(kind)) {
    // Honours can only make pungs. A lone honour is the most useless tile in the hand.
    return counts[kind] === 1 ? -1 : score;
  }
  const suitStart = Math.floor(kind / 9) * 9;
  const has = (k: Kind) => k >= suitStart && k < suitStart + 9 && counts[k] > 0;
  if (has(kind - 1)) score += 1;
  if (has(kind + 1)) score += 1;
  if (has(kind - 2)) score += 0.5;
  if (has(kind + 2)) score += 0.5;
  return score;
}

/** The tile a bot would discard from this hand. */
export function chooseDiscard(hand: readonly Tile[], rng: Rng): Tile {
  const counts = countsFromTiles(hand);
  let best: Tile[] = [];
  let bestScore = Infinity;
  for (const t of hand) {
    const s = tileUsefulness(counts, kindOf(t));
    if (s < bestScore) {
      bestScore = s;
      best = [t];
    } else if (s === bestScore) {
      best.push(t);
    }
  }
  return best[rng.int(best.length)];
}

/** What a bot sitting at `seat` does right now, or null if it has nothing to do. */
export function botAction(state: GameState, seat: number, rng: Rng): Action | null {
  const legal = legalActions(state, seat);
  if (legal.length === 0) return null;
  if (state.phase === 'ROUND_END') return null; // humans decide when to start the next round

  if (state.phase === 'CLAIM_WINDOW') {
    return legal.find((a) => a.type === 'claim' && a.claim === 'win') ?? { type: 'pass' };
  }
  if (state.phase === 'AWAIT_DISCARD') {
    const win = legal.find((a) => a.type === 'declare_win');
    if (win) return win;
    return { type: 'discard', tileId: chooseDiscard(state.players[seat].hand, rng) };
  }
  return null;
}
