/**
 * The game reducer.
 *
 *   applyAction(state, seat, action) -> { state, events } | { error }
 *
 * It never mutates its input: it clones the state, changes the clone and returns it.
 * Every action is checked against legalActions() first, so the list the UI renders
 * and the rules the reducer enforces can never disagree.
 *
 * Flow of one turn:
 *   AWAIT_DISCARD (turn player has 14-shaped hand)
 *     -> discard            -> CLAIM_WINDOW (others may claim; may be nobody)
 *     -> declare_win        -> ROUND_END
 *     -> concealed/added kong -> draw replacement, stay in AWAIT_DISCARD
 *   CLAIM_WINDOW
 *     -> each eligible player claims or passes; the DRIVER then calls resolveClaims()
 *        (when everyone answered, or the claim timer ran out)
 *     -> resolveClaims: win -> ROUND_END; pung/chow/kong -> claimer's AWAIT_DISCARD;
 *        nobody -> next player draws (or ROUND_END draw if the wall is empty)
 */
import { canDrawFromWall, canDrawReplacement, claimOptionsFor, pickClaim, seatAfter } from './claims';
import { canWin } from './hand';
import { takeKinds } from './melds';
import { RULES, type Rules } from './rules';
import { countsFromTiles, kindOf, type Kind, type Tile } from './tiles';
import type { Action, ActionResult, GameEvent, GameState, Meld } from './types';
import { buildWall, createRng, rollDice } from './wall';

export interface CreateGameOptions {
  seed: number;
  rules?: Rules;
}

/** A new game sitting in the LOBBY. Call startRound() to deal. */
export function createGame({ seed, rules = RULES }: CreateGameOptions): GameState {
  if (rules.useBonusTiles) {
    throw new Error('RULES.useBonusTiles = true is not implemented yet (stretch goal). Set it to false.');
  }
  if (!rules.roundEndsWhenWallEmpty) {
    // With no tiles left to draw there is no other sensible outcome; the flag exists so the choice is explicit.
    throw new Error('RULES.roundEndsWhenWallEmpty = false has no defined behaviour. Keep it true.');
  }
  return {
    rules,
    phase: 'LOBBY',
    rngState: seed >>> 0,
    round: 0,
    dealer: 0,
    dice: [],
    wall: [],
    players: [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [] })),
    turn: 0,
    drawn: null,
    drawSource: 'wall',
    lastDiscard: null,
    claimWindow: null,
    result: null,
    tally: [0, 0, 0, 0],
    stepId: 0,
  };
}

/** Who deals the next round, based on how the previous one ended. */
function nextDealer(state: GameState): number {
  const r = state.result;
  if (state.rules.dealerRepeatsOnWin && r?.type === 'win' && r.winner === state.dealer) return state.dealer;
  return seatAfter(state.dealer);
}

/**
 * Shuffle, pick the dealer and deal: 13 tiles each, the dealer draws a 14th.
 * First round: dice decide the dealer. Later rounds: dealer rotates (see RULES.dealerRepeatsOnWin).
 */
export function startRound(prev: GameState): { state: GameState; events: GameEvent[] } {
  const state = clone(prev);
  const rng = createRng(state.rngState);
  // DEALING (synchronous)
  if (state.round === 0) {
    state.dice = rollDice(rng, 2);
    const total = state.dice[0] + state.dice[1];
    state.dealer = (total - 1) % 4; // count seats from seat 0
  } else {
    state.dealer = nextDealer(state);
  }
  state.wall = buildWall(rng);
  state.rngState = rng.state;
  state.round += 1;
  state.players = [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [] }));
  for (let i = 0; i < 4; i++) {
    const seat = seatAfter(state.dealer, i);
    state.players[seat].hand = state.wall.splice(0, 13);
  }
  // The dealer draws one extra tile to start.
  const first = state.wall.shift()!;
  state.players[state.dealer].hand.push(first);
  state.turn = state.dealer;
  state.drawn = first;
  state.drawSource = 'wall';
  state.lastDiscard = null;
  state.claimWindow = null;
  state.result = null;
  state.phase = 'AWAIT_DISCARD';
  state.stepId += 1;
  return { state, events: [{ type: 'round_start', round: state.round, dealer: state.dealer, dice: state.dice }] };
}

/** Everything `seat` may do right now. The UI renders exactly this list; the reducer accepts only this list. */
export function legalActions(state: GameState, seat: number): Action[] {
  switch (state.phase) {
    case 'ROUND_END':
      return [{ type: 'next_round' }];
    case 'AWAIT_DISCARD': {
      if (seat !== state.turn) return [];
      const player = state.players[seat];
      const actions: Action[] = [];
      const counts = countsFromTiles(player.hand);
      // After a pung/chow claim nothing was drawn, so no self-draw win or kong (default, see README).
      const drewTile = state.drawSource !== 'claim';
      if (drewTile && state.rules.winOnSelfDraw && canWin(counts, player.melds.length)) {
        actions.push({ type: 'declare_win' });
      }
      if (drewTile && canDrawReplacement(state)) {
        for (let k = 0; k < counts.length; k++) {
          if (counts[k] === 4) actions.push({ type: 'concealed_kong', kind: k });
        }
        for (const m of player.melds) {
          if (m.type === 'pung' && counts[m.kinds[0]] >= 1) actions.push({ type: 'added_kong', kind: m.kinds[0] });
        }
      }
      for (const t of player.hand) actions.push({ type: 'discard', tileId: t });
      return actions;
    }
    case 'CLAIM_WINDOW': {
      const w = state.claimWindow!;
      if (w.options[seat].length === 0 || w.responses[seat] !== null) return [];
      return [...w.options[seat], { type: 'pass' }];
    }
    default:
      return [];
  }
}

/** Do two actions describe the same move? */
export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'discard':
      return a.tileId === (b as typeof a).tileId;
    case 'concealed_kong':
    case 'added_kong':
      return a.kind === (b as typeof a).kind;
    case 'claim': {
      const c = b as typeof a;
      if (a.claim !== c.claim) return false;
      if (a.claim !== 'chow') return true;
      return (a.chowKinds ?? []).join(',') === (c.chowKinds ?? []).join(',');
    }
    default:
      return true;
  }
}

/** Apply one player's action. Illegal actions return { error } and change nothing. */
export function applyAction(prev: GameState, seat: number, action: Action): ActionResult {
  if (!legalActions(prev, seat).some((a) => sameAction(a, action))) {
    return { error: explainIllegal(prev, seat, action) };
  }
  if (action.type === 'next_round') return startRound(prev);

  const state = clone(prev);
  const events: GameEvent[] = [];
  const player = state.players[seat];

  switch (action.type) {
    case 'discard': {
      player.hand.splice(player.hand.indexOf(action.tileId), 1);
      player.discards.push(action.tileId);
      state.drawn = null;
      state.lastDiscard = { seat, tile: action.tileId };
      events.push({ type: 'discard', seat, tile: action.tileId });
      openClaimWindow(state, seat, action.tileId);
      break;
    }
    case 'declare_win': {
      endWithWin(state, events, seat, 'self-draw', state.drawn ?? player.hand[player.hand.length - 1]);
      break;
    }
    case 'concealed_kong': {
      const tiles = takeKinds(player.hand, [action.kind, action.kind, action.kind, action.kind]);
      const meld: Meld = { type: 'kong', kinds: [action.kind, action.kind, action.kind, action.kind], tiles, open: false };
      player.melds.push(meld);
      events.push({ type: 'call', seat, call: 'concealed_kong', meld });
      drawReplacement(state, events, seat);
      break;
    }
    case 'added_kong': {
      // Upgrade an open pung with the 4th tile from the hand. (Robbing the kong is not in this ruleset.)
      const meld = player.melds.find((m) => m.type === 'pung' && m.kinds[0] === action.kind)!;
      meld.tiles.push(...takeKinds(player.hand, [action.kind]));
      meld.kinds.push(action.kind);
      meld.type = 'kong';
      events.push({ type: 'call', seat, call: 'added_kong', meld });
      drawReplacement(state, events, seat);
      break;
    }
    case 'claim':
    case 'pass': {
      state.claimWindow!.responses[seat] = action;
      break;
    }
  }
  return { state, events };
}

/** True once every eligible player has claimed or passed. */
export function allClaimsIn(state: GameState): boolean {
  const w = state.claimWindow;
  if (!w) return false;
  return w.options.every((opts, seat) => opts.length === 0 || w.responses[seat] !== null);
}

/**
 * Close the claim window: apply the winning claim, or move on to the next player's draw.
 * Called by the driver when everyone answered or the claim timer ran out (unanswered = pass).
 */
export function resolveClaims(prev: GameState): { state: GameState; events: GameEvent[] } {
  if (prev.phase !== 'CLAIM_WINDOW') throw new Error('resolveClaims called outside CLAIM_WINDOW');
  const state = clone(prev);
  const events: GameEvent[] = [];
  const w = state.claimWindow!;
  const winner = pickClaim(state.rules, w.discarder, w.responses);
  state.claimWindow = null;

  if (!winner) {
    const next = seatAfter(w.discarder);
    if (!canDrawFromWall(state)) {
      endWithDraw(state, events);
    } else {
      const tile = state.wall.shift()!;
      state.players[next].hand.push(tile);
      state.turn = next;
      state.drawn = tile;
      state.drawSource = 'wall';
      state.phase = 'AWAIT_DISCARD';
      state.stepId += 1;
      events.push({ type: 'draw', seat: next, source: 'wall' });
    }
    return { state, events };
  }

  const { seat, action } = winner;
  const claimer = state.players[seat];
  // The claimed tile leaves the discarder's river.
  const river = state.players[w.discarder].discards;
  river.splice(river.lastIndexOf(w.tile), 1);
  const kind = kindOf(w.tile);

  if (action.claim === 'win') {
    claimer.hand.push(w.tile);
    endWithWin(state, events, seat, 'discard', w.tile, w.discarder);
    return { state, events };
  }

  let meld: Meld;
  if (action.claim === 'chow') {
    const run = action.chowKinds!;
    const fromHand = takeKinds(claimer.hand, removeOnce(run, kind));
    meld = { type: 'chow', kinds: [...run], tiles: sortById([...fromHand, w.tile]), open: true, from: w.discarder, claimedTile: w.tile };
  } else {
    const n = action.claim === 'pung' ? 2 : 3;
    const fromHand = takeKinds(claimer.hand, new Array<Kind>(n).fill(kind));
    meld = {
      type: action.claim,
      kinds: new Array<Kind>(n + 1).fill(kind),
      tiles: [...fromHand, w.tile],
      open: true,
      from: w.discarder,
      claimedTile: w.tile,
    };
  }
  claimer.melds.push(meld);
  events.push({ type: 'call', seat, call: action.claim, meld });

  // Turn order continues from the claimer (players in between are skipped).
  state.turn = seat;
  state.phase = 'AWAIT_DISCARD';
  state.stepId += 1;
  if (action.claim === 'kong') {
    drawReplacement(state, events, seat);
  } else {
    state.drawn = null;
    state.drawSource = 'claim';
  }
  return { state, events };
}

// ---------------------------------------------------------------------------
// internals

function openClaimWindow(state: GameState, discarder: number, tile: Tile) {
  const options = [0, 1, 2, 3].map((s) => claimOptionsFor(state, s, discarder, tile));
  state.claimWindow = { discarder, tile, options, responses: [null, null, null, null] };
  state.turn = discarder;
  state.phase = 'CLAIM_WINDOW';
  state.stepId += 1;
}

/** Kong replacement: draw from the END of the wall. A win on this tile counts as self-draw. */
function drawReplacement(state: GameState, events: GameEvent[], seat: number) {
  const tile = state.wall.pop()!;
  state.players[seat].hand.push(tile);
  state.drawn = tile;
  state.drawSource = 'kong';
  state.turn = seat;
  state.phase = 'AWAIT_DISCARD';
  state.stepId += 1;
  events.push({ type: 'draw', seat, source: 'kong' });
}

function endWithWin(
  state: GameState,
  events: GameEvent[],
  seat: number,
  winType: 'discard' | 'self-draw',
  tile: Tile,
  from?: number,
) {
  state.result = { type: 'win', winner: seat, winType, winningTile: tile, ...(from !== undefined ? { from } : {}) };
  state.tally[seat] += 1;
  state.phase = 'ROUND_END';
  state.claimWindow = null;
  state.stepId += 1;
  events.push({ type: 'win', seat, winType, tile, ...(from !== undefined ? { from } : {}) });
}

function endWithDraw(state: GameState, events: GameEvent[]) {
  state.result = { type: 'draw' };
  state.phase = 'ROUND_END';
  state.drawn = null;
  state.stepId += 1;
  events.push({ type: 'round_draw' });
}

/** A friendly reason for an illegal move. */
function explainIllegal(state: GameState, seat: number, action: Action): string {
  if (state.phase === 'LOBBY') return "The game hasn't started yet.";
  if (state.phase === 'ROUND_END') return 'This round is over. Start the next one!';
  if (action.type === 'claim' || action.type === 'pass') {
    if (state.phase !== 'CLAIM_WINDOW') return 'There is nothing to claim right now.';
    const w = state.claimWindow!;
    if (seat === w.discarder) return "You can't claim your own discard.";
    if (w.responses[seat] !== null) return 'You already answered for this discard.';
    if (action.type === 'claim' && action.claim === 'chow') {
      if (kindOf(w.tile) >= 27) return "You can't chow winds or dragons.";
      if (state.rules.chowOnlyFromPrevious && seat !== seatAfter(w.discarder)) return "You can't chow from that player.";
      return "Those tiles don't make a chow.";
    }
    if (action.type === 'claim' && action.claim === 'win') return "That tile doesn't complete your hand.";
    return "You can't claim that tile.";
  }
  if (state.phase === 'CLAIM_WINDOW') return 'Wait for everyone to decide on the discard.';
  if (seat !== state.turn) return "It's not your turn.";
  if (action.type === 'discard') return "You don't have that tile.";
  if (action.type === 'declare_win') return "Your hand isn't complete yet.";
  return "That move isn't allowed right now.";
}

function clone(s: GameState): GameState {
  // State is plain JSON data (numbers, arrays, objects), so a JSON round-trip is a safe deep copy.
  return JSON.parse(JSON.stringify(s)) as GameState;
}

function removeOnce(kinds: readonly Kind[], k: Kind): Kind[] {
  const out = [...kinds];
  out.splice(out.indexOf(k), 1);
  return out;
}

const sortById = (tiles: Tile[]) => tiles.sort((a, b) => a - b);
