import type { Rules } from './rules';
import type { Kind, Tile } from './tiles';

/**
 * Game phases.
 *   LOBBY          created, no tiles dealt yet
 *   DEALING        (transient) shuffling + dealing happens synchronously inside startRound()
 *   AWAIT_DISCARD  `turn` must discard (or declare a self-drawn win / kong)
 *   CLAIM_WINDOW   a tile was just discarded; other players may claim it
 *   ROUND_END      someone won, or the wall ran out
 */
export type Phase = 'LOBBY' | 'DEALING' | 'AWAIT_DISCARD' | 'CLAIM_WINDOW' | 'ROUND_END';

export type ClaimType = 'win' | 'pung' | 'kong' | 'chow';

export type Action =
  | { type: 'discard'; tileId: Tile }
  | { type: 'claim'; claim: ClaimType; chowKinds?: Kind[] }
  | { type: 'pass' }
  | { type: 'declare_win' }
  | { type: 'concealed_kong'; kind: Kind }
  | { type: 'added_kong'; kind: Kind }
  | { type: 'next_round' };

export interface Meld {
  type: 'chow' | 'pung' | 'kong';
  /** Kinds in the meld, sorted. A kong has 4 entries. */
  kinds: Kind[];
  /** The physical tiles in the meld (needed to account for all 136 tiles). */
  tiles: Tile[];
  /** false only for a concealed kong. */
  open: boolean;
  /** Seat the claimed tile came from (claimed melds only). */
  from?: number;
  /** The tile that was claimed from a discard (claimed melds only). */
  claimedTile?: Tile;
}

export interface PlayerState {
  /** Concealed tiles, including a just-drawn tile. */
  hand: Tile[];
  melds: Meld[];
  /** This player's discard river, oldest first. Claimed tiles are removed from here. */
  discards: Tile[];
}

/** Where the tile the current player just received came from. A 'claim' means no draw happened (pung/chow). */
export type DrawSource = 'wall' | 'kong' | 'claim';

export interface ClaimWindow {
  discarder: number;
  tile: Tile;
  /** options[seat] = legal claim actions for that seat (empty = not eligible, skipped automatically). */
  options: Action[][];
  /** responses[seat] = the claim or pass that seat chose, null = still deciding. */
  responses: (Action | null)[];
}

export interface RoundResult {
  type: 'win' | 'draw';
  winner?: number;
  winType?: 'discard' | 'self-draw';
  /** Seat that discarded the winning tile (discard wins only). */
  from?: number;
  winningTile?: Tile;
}

export interface GameState {
  rules: Rules;
  phase: Phase;
  /** Seeded RNG state, so the reducer stays pure and games are reproducible. */
  rngState: number;
  /** Round number, 1-based (0 while in LOBBY). */
  round: number;
  dealer: number;
  /** The dice rolled to pick the first dealer. */
  dice: number[];
  /** Live wall. Normal draws come from index 0, kong replacements from the end. */
  wall: Tile[];
  players: PlayerState[];
  /** AWAIT_DISCARD: who must act. CLAIM_WINDOW: who discarded. */
  turn: number;
  /** Tile the current player just drew (kept separate in the UI). */
  drawn: Tile | null;
  drawSource: DrawSource;
  lastDiscard: { seat: number; tile: Tile } | null;
  claimWindow: ClaimWindow | null;
  result: RoundResult | null;
  /** Wins per seat this session. */
  tally: number[];
  /**
   * Increments every time the game moves to a new step (new turn, new claim window, round end).
   * Drivers use it to know when to restart their timers. Claim responses do NOT change it.
   */
  stepId: number;
}

/** Public events (safe to show every player: they never include hidden tiles). */
export type GameEvent =
  | { type: 'round_start'; round: number; dealer: number; dice: number[] }
  | { type: 'draw'; seat: number; source: 'wall' | 'kong' }
  | { type: 'discard'; seat: number; tile: Tile }
  | { type: 'call'; seat: number; call: 'pung' | 'kong' | 'chow' | 'concealed_kong' | 'added_kong'; meld: Meld }
  | { type: 'win'; seat: number; winType: 'discard' | 'self-draw'; from?: number; tile: Tile }
  | { type: 'round_draw' };

export type ActionResult = { state: GameState; events: GameEvent[] } | { error: string };
