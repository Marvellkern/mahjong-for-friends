/**
 * What ONE player is allowed to see.
 *
 * This is the only thing the server sends to a client. Other players' concealed
 * tiles are reduced to a count; all hands are revealed only at ROUND_END.
 * Local (vs bots) mode uses the same view so both modes render identically.
 */
import { legalActions } from './game';
import { waits as computeWaits } from './hand';
import { meldCounts } from './melds';
import { Kind, Tile, countsFromTiles, sortTiles } from './tiles';
import type { Action, Meld, Phase, RoundResult } from './types';
import type { GameState } from './types';

export interface SeatInfo {
  name: string;
  isBot: boolean;
  connected: boolean;
  /** A human who timed out twice in a row (or is away): a bot is playing their seat until they come back. */
  away?: boolean;
}

export interface SeatView extends SeatInfo {
  handCount: number;
  melds: Meld[];
  discards: Tile[];
  isDealer: boolean;
}

export interface PlayerView {
  roomCode: string;
  phase: Phase;
  mySeat: number;
  /** My concealed tiles, sorted, WITHOUT the just-drawn tile. */
  myHand: Tile[];
  /** The tile I just drew (shown slightly apart). */
  myDrawnTile?: Tile;
  /** The server says what is legal; the UI only renders it. */
  legalActions: Action[];
  seats: SeatView[];
  wallCount: number;
  currentTurn: number;
  round: number;
  lastDiscard?: { seat: number; tile: Tile };
  /** Epoch ms when the claim window closes (only while I can still claim). */
  claimDeadline?: number;
  /** Epoch ms when my turn times out (only on my turn, only if the room has a turn timer). */
  turnDeadline?: number;
  /** Kinds that would complete my hand (only if the hint is on and I'm one tile away). */
  waits?: Kind[];
  roundResult?: RoundResult & { hands?: Record<number, Tile[]> };
  /** Wins per seat this session. */
  tally: number[];
}

export interface ViewMeta {
  roomCode: string;
  seats: SeatInfo[];
  claimDeadline?: number;
  /** When the CURRENT turn times out, if the room uses a turn timer. */
  turnDeadline?: number;
  showWaits?: boolean;
}

export function buildPlayerView(state: GameState, seat: number, meta: ViewMeta): PlayerView {
  const me = state.players[seat];
  const drawn = state.phase === 'AWAIT_DISCARD' && state.turn === seat && state.drawn !== null ? state.drawn : undefined;
  const legal = legalActions(state, seat);

  const view: PlayerView = {
    roomCode: meta.roomCode,
    phase: state.phase,
    mySeat: seat,
    myHand: sortTiles(me.hand.filter((t) => t !== drawn)),
    legalActions: legal,
    seats: state.players.map((p, i) => ({
      ...meta.seats[i],
      handCount: p.hand.length,
      melds: p.melds,
      discards: p.discards,
      isDealer: state.round > 0 && state.dealer === i,
    })),
    wallCount: state.wall.length,
    currentTurn: state.turn,
    round: state.round,
    tally: state.tally,
  };
  if (drawn !== undefined) view.myDrawnTile = drawn;
  if (state.lastDiscard) view.lastDiscard = state.lastDiscard;
  if (state.phase === 'CLAIM_WINDOW' && legal.length > 0 && meta.claimDeadline) view.claimDeadline = meta.claimDeadline;
  if (state.phase === 'AWAIT_DISCARD' && state.turn === seat && meta.turnDeadline) view.turnDeadline = meta.turnDeadline;

  // Ready-hand hint: only when my concealed hand is one tile short of complete (3n+1 tiles).
  if (meta.showWaits && state.phase !== 'ROUND_END' && me.hand.length % 3 === 1) {
    view.waits = computeWaits(countsFromTiles(me.hand), me.melds.length, meldCounts(me.melds));
  }

  if (state.phase === 'ROUND_END' && state.result) {
    const hands: Record<number, Tile[]> = {};
    state.players.forEach((p, i) => (hands[i] = sortTiles(p.hand)));
    view.roundResult = { ...state.result, hands };
  }
  return view;
}
