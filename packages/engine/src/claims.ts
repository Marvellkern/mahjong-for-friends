/**
 * Claiming a discard.
 *
 * After a discard, every other player gets their list of legal claims. Players
 * with no legal claim are skipped automatically. When everyone eligible has
 * responded (or the timer runs out, which the driver handles), resolveClaims()
 * picks the single winning claim:
 *
 *   1. Priority from RULES.claimPriority (default: win > pung/kong > chow).
 *   2. Same priority: the player closest in turn order after the discarder.
 */
import { canWin } from './hand';
import { chowOptions } from './melds';
import type { Rules, ClaimPriorityGroup } from './rules';
import { Tile, countsFromTiles, kindOf } from './tiles';
import type { Action, ClaimType, GameState } from './types';

/** Seats after the discarder, in turn order. */
export const seatAfter = (seat: number, steps = 1) => (seat + steps) % 4;

/** How many seats after the discarder this seat sits (1 = next in turn order). */
export const distanceFrom = (discarder: number, seat: number) => (seat - discarder + 4) % 4;

/** Can a replacement tile be drawn for a kong right now? */
export const canDrawReplacement = (state: GameState) => state.wall.length > 0;

/** Can the next player draw a normal tile? With a dead wall, the last 14 tiles are reserved. */
export const canDrawFromWall = (state: GameState) => state.wall.length > (state.rules.deadWall ? 14 : 0);

/** Legal claims for `seat` on `tile` discarded by `discarder` (pass not included). */
export function claimOptionsFor(state: GameState, seat: number, discarder: number, tile: Tile): Action[] {
  if (seat === discarder) return [];
  const { rules } = state;
  const player = state.players[seat];
  const kind = kindOf(tile);
  const counts = countsFromTiles(player.hand);
  const options: Action[] = [];

  if (rules.winOnDiscard) {
    counts[kind]++;
    if (canWin(counts, player.melds.length)) options.push({ type: 'claim', claim: 'win' });
    counts[kind]--;
  }
  if (counts[kind] >= 2) options.push({ type: 'claim', claim: 'pung' });
  if (counts[kind] >= 3 && canDrawReplacement(state)) options.push({ type: 'claim', claim: 'kong' });
  if (!rules.chowOnlyFromPrevious || seat === seatAfter(discarder)) {
    for (const run of chowOptions(player.hand, kind)) options.push({ type: 'claim', claim: 'chow', chowKinds: run });
  }
  return options;
}

function priorityGroup(claim: ClaimType): ClaimPriorityGroup {
  if (claim === 'win') return 'win';
  if (claim === 'chow') return 'chow';
  return 'pung_kong';
}

/**
 * Pick the winning claim among responses. Returns null if everyone passed.
 * Unanswered seats (null) count as a pass.
 */
export function pickClaim(
  rules: Rules,
  discarder: number,
  responses: readonly (Action | null)[],
): { seat: number; action: Extract<Action, { type: 'claim' }> } | null {
  let best: { seat: number; action: Extract<Action, { type: 'claim' }>; rank: number; dist: number } | null = null;
  for (let seat = 0; seat < responses.length; seat++) {
    const r = responses[seat];
    if (!r || r.type !== 'claim') continue;
    const rank = rules.claimPriority.indexOf(priorityGroup(r.claim));
    const dist = distanceFrom(discarder, seat);
    // Lower rank index = higher priority. Ties -> closest after the discarder ('closest_after_discarder').
    if (!best || rank < best.rank || (rank === best.rank && dist < best.dist)) {
      best = { seat, action: r, rank, dist };
    }
  }
  return best ? { seat: best.seat, action: best.action } : null;
}
