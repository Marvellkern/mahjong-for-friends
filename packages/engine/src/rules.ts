/**
 * Every rule the reference video does not spell out lives here, and ONLY here.
 * Flip a value to change behaviour; no other file hard-codes these defaults.
 *
 * See README "Rules & defaults" for the plain-English list.
 */

export type ClaimPriorityGroup = 'win' | 'pung_kong' | 'chow';

/** The shape of RULES, kept wide so tests/rooms can pass an override like { ...RULES, chowOnlyFromPrevious: false }. */
export interface Rules {
  useBonusTiles: boolean;
  chowOnlyFromPrevious: boolean;
  winOnDiscard: boolean;
  winOnSelfDraw: boolean;
  claimPriority: readonly ClaimPriorityGroup[];
  multipleWinnersPolicy: 'closest_after_discarder';
  dealerRepeatsOnWin: boolean;
  roundEndsWhenWallEmpty: boolean;
  deadWall: boolean;
  claimWindowMs: number;
  claimMinDelayMs: number;
  turnTimerMs: number | null;
  fillEmptySeatsWithBots: boolean;
}

export const RULES: Readonly<Rules> = {
  /** false = 136 tiles. true = 144 with flowers/seasons. NOT IMPLEMENTED YET (stretch goal) -> DECISION FOR OWNER. */
  useBonusTiles: false,
  /** Chow can only be claimed from the player whose turn came right before yours. */
  chowOnlyFromPrevious: true,
  /** You can win on another player's discard (from the video). */
  winOnDiscard: true,
  /** You can win on your own draw (from the video). */
  winOnSelfDraw: true,
  /** Claim priority, highest first. */
  claimPriority: ['win', 'pung_kong', 'chow'],
  /** If 2+ players claim the same discard at equal priority, the one next in turn order after the discarder gets it. */
  multipleWinnersPolicy: 'closest_after_discarder',
  /** false = dealer rotates every round. true = dealer stays when the dealer wins. */
  dealerRepeatsOnWin: false,
  /** Nobody wins when the wall runs out -> "draw round", then the next round is dealt with the normal dealer rotation. */
  roundEndsWhenWallEmpty: true,
  /**
   * false = kong replacement tiles come from the END of the live wall.
   * true  = the last 14 tiles are reserved; normal draws stop when only those remain.
   */
  deadWall: false,
  /** How long players get to claim a discard. */
  claimWindowMs: 10000,
  /** Minimum pause after every discard, even if nobody can claim, so timing doesn't leak who holds what. */
  claimMinDelayMs: 1200,
  /** No turn timer by default (friends, no AFK kicks). A number = ms before your turn is auto-played (drawn tile discarded). */
  turnTimerMs: null,
  /** Empty seats are filled with bots when a room starts. */
  fillEmptySeatsWithBots: true,
};
