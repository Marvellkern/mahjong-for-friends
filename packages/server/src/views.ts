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
}

export interface RoomSnapshot {
  code: string;
  started: boolean;
  mySeat: number;
  hostSeat: number;
  seats: LobbySeat[];
  /** The game as seen from my seat (null while in the lobby). */
  view: PlayerView | null;
}

export function buildSnapshot(room: Room, seat: number): RoomSnapshot {
  const seats: LobbySeat[] = room.seats.map((s) =>
    s ? { empty: false, name: s.name, isBot: s.kind === 'bot', connected: s.connected } : { empty: true, name: '', isBot: false, connected: false },
  );
  let view: PlayerView | null = null;
  if (room.game) {
    view = buildPlayerView(room.game, seat, {
      roomCode: room.code,
      seats: seats.map(({ name, isBot, connected }) => ({ name, isBot, connected })),
      claimDeadline: room.claimDeadline,
      showWaits: room.seats[seat]?.showWaits ?? false,
    });
  }
  return { code: room.code, started: room.started, mySeat: seat, hostSeat: room.hostSeat, seats, view };
}
