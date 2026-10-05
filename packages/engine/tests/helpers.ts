import { createGame, applyAction, resolveClaims } from '../src/game';
import { parseKinds } from '../src/notation';
import { RULES, type Rules } from '../src/rules';
import { kindOf } from '../src/tiles';
import type { Action, GameState } from '../src/types';

export interface SetupOptions {
  /** Four hands in shorthand. The `turn` player should have 14-shaped hand (3n+2 incl. melds). */
  hands: string[];
  turn?: number;
  /** Tiles at the END of the wall (next kong replacement is the LAST one written). */
  wallEnd?: string;
  /** Empty the wall completely (to test draw rounds). */
  emptyWall?: boolean;
  rules?: Rules;
}

/** Build a mid-round state from shorthand hands. Unused tiles go into the wall. */
export function setup(opts: SetupOptions): GameState {
  const used = new Array<number>(34).fill(0);
  const take = (k: number) => {
    if (used[k] >= 4) throw new Error(`too many copies of kind ${k}`);
    return k * 4 + used[k]++;
  };
  const g = createGame({ seed: 1, rules: opts.rules ?? RULES });
  g.players = opts.hands.map((h) => ({ hand: parseKinds(h).map(take), melds: [], discards: [] }));
  const end = opts.wallEnd ? parseKinds(opts.wallEnd).map(take) : [];
  const rest: number[] = [];
  for (let id = 0; id < 136; id++) {
    if (id % 4 >= used[kindOf(id)]) rest.push(id);
  }
  g.wall = opts.emptyWall ? [] : [...rest, ...end];
  g.phase = 'AWAIT_DISCARD';
  g.round = 1;
  g.turn = opts.turn ?? 0;
  const hand = g.players[g.turn].hand;
  g.drawn = hand[hand.length - 1];
  g.drawSource = 'wall';
  g.stepId = 1;
  return g;
}

export function act(state: GameState, seat: number, action: Action): GameState {
  const res = applyAction(state, seat, action);
  if ('error' in res) throw new Error(`seat ${seat} ${JSON.stringify(action)}: ${res.error}`);
  return res.state;
}

export function tryAct(state: GameState, seat: number, action: Action): string | null {
  const res = applyAction(state, seat, action);
  return 'error' in res ? res.error : null;
}

/** Discard one tile of the given shorthand kind (e.g. "5m"). */
export function discardKind(state: GameState, seat: number, kind: string): GameState {
  const k = parseKinds(kind)[0];
  const tile = state.players[seat].hand.find((t) => kindOf(t) === k);
  if (tile === undefined) throw new Error(`seat ${seat} has no ${kind}`);
  return act(state, seat, { type: 'discard', tileId: tile });
}

export const resolve = (s: GameState) => resolveClaims(s).state;
export const k = (s: string) => parseKinds(s)[0];
export const ks = (s: string) => parseKinds(s);
