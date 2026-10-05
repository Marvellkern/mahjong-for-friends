/**
 * Builds what ONE client receives. This is the privacy boundary:
 *   - other players' concealed tiles are never included (only counts), until ROUND_END
 *   - browser tokens are never included
 * The engine's buildPlayerView does the game part; this adds the room/lobby part.
 */
import { buildPlayerView, type PlayerView } from '@mahjong/engine';
import type { Room } from './rooms';

export interface LobbySeat {
  empty: boolean;
  name: string;
  isBot: boolean;
  connected: boolean;
  /** A bot is playing this human's seat (they timed out too often). */
  away: boolean;
}

export interface RoomSnapshot {
  code: string;
  started: boolean;
  mySeat: number;
  hostSeat: number;
  /** Turn timer the host picked (null = off). */
  turnTimerMs: number | null;
  /** Timer choices for the host's lobby picker (besides Off). */
  turnTimerOptionsMs: readonly number[];
  seats: LobbySeat[];
  /** The game as seen from my seat (null while in the lobby). */
  view: PlayerView | null;
}

export function buildSnapshot(room: Room, seat: number): RoomSnapshot {
  const seats: LobbySeat[] = room.seats.map((s) =>
    s
      ? { empty: false, name: s.name, isBot: s.kind === 'bot', connected: s.connected, away: s.away }
      : { empty: true, name: '', isBot: false, connected: false, away: false },
  );
  let view: PlayerView | null = null;
  if (room.game) {
    view = buildPlayerView(room.game, seat, {
      roomCode: room.code,
      seats: seats.map(({ name, isBot, connected, away }) => ({ name, isBot, connected, away })),
      claimDeadline: room.claimDeadline,
      turnDeadline: room.turnDeadline,
      showWaits: room.seats[seat]?.showWaits ?? false,
    });
  }
  return {
    code: room.code,
    started: room.started,
    mySeat: seat,
    hostSeat: room.hostSeat,
    turnTimerMs: room.turnTimerMs,
    turnTimerOptionsMs: room.turnTimerOptions,
    seats,
    view,
  };
}
