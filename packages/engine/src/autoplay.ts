/**
 * Timing plan shared by the server and the local (vs bots) mode.
 *
 * The reducer has no clock. A "driver" (server room or React hook) owns the timers and asks:
 * "given this state, what automatic thing happens next, and when?"
 *
 *   - a bot's turn or a bot's claim decision
 *   - closing the claim window (everyone answered, but never before the minimum delay,
 *     so timing doesn't reveal who could claim; or the claim timer ran out)
 *   - the optional turn timer (RULES.turnTimerMs) for humans
 *
 * Drivers call planNextStep() after every state change, (re)arm ONE timer for step.at,
 * then call runStep() when it fires.
 */
import { botAction, chooseDiscard } from './bots';
import { allClaimsIn, applyAction, legalActions, resolveClaims } from './game';
import type { Action, GameEvent, GameState } from './types';
import type { Rng } from './wall';

export interface Timing {
  /** When the current step (state.stepId) started, epoch ms. */
  stepSince: number;
  /** Delay before a bot plays its turn. */
  botTurnMs: number;
  /** Delay before a bot answers a claim window. */
  botClaimMs: number;
  /** Minimum time a claim window stays open. */
  claimMinDelayMs: number;
  /** Maximum time a claim window stays open. */
  claimWindowMs: number;
  /** Optional per-turn timer for humans (null = wait forever). */
  turnTimerMs: number | null;
}

export type AutoStep =
  | { kind: 'bot'; seat: number; at: number }
  | { kind: 'resolve_claims'; at: number }
  | { kind: 'turn_timeout'; seat: number; at: number };

export function planNextStep(state: GameState, isBot: (seat: number) => boolean, t: Timing): AutoStep | null {
  if (state.phase === 'AWAIT_DISCARD') {
    if (isBot(state.turn)) return { kind: 'bot', seat: state.turn, at: t.stepSince + t.botTurnMs };
    if (t.turnTimerMs !== null) return { kind: 'turn_timeout', seat: state.turn, at: t.stepSince + t.turnTimerMs };
    return null;
  }
  if (state.phase === 'CLAIM_WINDOW') {
    const w = state.claimWindow!;
    const pendingBot = w.options.findIndex((o, seat) => o.length > 0 && w.responses[seat] === null && isBot(seat));
    if (pendingBot >= 0) return { kind: 'bot', seat: pendingBot, at: t.stepSince + t.botClaimMs };
    if (allClaimsIn(state)) return { kind: 'resolve_claims', at: t.stepSince + t.claimMinDelayMs };
    return { kind: 'resolve_claims', at: t.stepSince + t.claimWindowMs };
  }
  return null;
}

/**
 * What happens when a human's turn timer runs out. The rule: a timeout never costs you more
 * than the smallest possible move.
 *   1. Hand already complete -> declare Mahjong for them (never lose a win to looking away).
 *   2. Just drew a tile      -> discard that tile, so the hand stays exactly as it was.
 *   3. Just claimed (no draw) -> discard the tile the bot logic rates least useful.
 * Kongs are never declared automatically: that's a real choice.
 */
export function timeoutAction(state: GameState, seat: number, rng: Rng): Action | null {
  const legal = legalActions(state, seat);
  const win = legal.find((a) => a.type === 'declare_win');
  if (win) return win;
  if (!legal.some((a) => a.type === 'discard')) return null;
  if (state.drawn !== null && legal.some((a) => a.type === 'discard' && a.tileId === state.drawn)) {
    return { type: 'discard', tileId: state.drawn };
  }
  return { type: 'discard', tileId: chooseDiscard(state.players[seat].hand, rng) };
}

/** Epoch ms when the claim window will close at the latest (for the UI countdown). */
export const claimDeadline = (t: Timing) => t.stepSince + t.claimWindowMs;

/** Execute a planned step. Returns the new state + events (or null if the step no longer applies). */
export function runStep(state: GameState, step: AutoStep, rng: Rng): { state: GameState; events: GameEvent[] } | null {
  if (step.kind === 'resolve_claims') {
    return state.phase === 'CLAIM_WINDOW' ? resolveClaims(state) : null;
  }
  const action = step.kind === 'bot' ? botAction(state, step.seat, rng) : timeoutAction(state, step.seat, rng);
  if (!action) return null;
  const res = applyAction(state, step.seat, action);
  return 'error' in res ? null : res;
}
