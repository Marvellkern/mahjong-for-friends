import type { Action, PlayerView } from '@mahjong/engine';

/** A short call banner ("Pung!") shown over the table. `id` changes on every new banner. */
export interface Banner {
  id: number;
  seat: number;
  text: string;
}

/** What the table UI needs. Both local (vs bots) and remote (Socket.IO) games implement this. */
export interface GameController {
  mode: 'local' | 'remote';
  view: PlayerView | null;
  act: (action: Action) => void;
  error: string | null;
  banner: Banner | null;
  showWaits: boolean;
  setShowWaits: (on: boolean) => void;
  connection: 'connected' | 'connecting' | 'reconnecting';
  leave: () => void;
}
