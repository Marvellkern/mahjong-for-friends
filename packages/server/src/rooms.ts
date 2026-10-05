/**
 * Rooms live in server memory only (no database). A server restart loses all rooms.
 *
 * Each seat is either empty, a bot, or a human identified by a random browser token
 * (stored in the browser's localStorage). Reconnecting with the same token restores
 * the same seat and hand. Disconnected humans keep their seat; bots do NOT take over
 * mid-round (the game waits for them, since there is no turn timer by default).
 */
import { randomInt } from 'node:crypto';
import {
  RULES,
  applyAction,
  createGame,
  createRng,
  planNextStep,
  runStep,
  startRound,
  type Action,
  type GameEvent,
  type GameState,
  type Rng,
  type Rules,
  type Timing,
} from '@mahjong/engine';

export interface Seat {
  kind: 'human' | 'bot';
  name: string;
  /** Secret per-browser token (humans only). NEVER sent to other clients. */
  token?: string;
  connected: boolean;
  showWaits: boolean;
}

export type Listener = (room: Room, events: GameEvent[]) => void;

// No I or O: too easy to confuse with 1 and 0 when reading a code aloud.
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const BOT_NAMES = ['Bot Lotus', 'Bot Crane', 'Bot Bamboo', 'Bot Plum'];

export class Room {
  readonly code: string;
  seats: (Seat | null)[] = [null, null, null, null];
  hostToken: string;
  game: GameState | null = null;
  /** When the current game step began (for claim/bot timers). */
  stepSince = Date.now();
  lastActivity = Date.now();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private botRng: Rng;

  constructor(
    code: string,
    hostToken: string,
    private readonly onChange: Listener,
    private readonly rules: Rules = RULES,
    private readonly timing: Omit<Timing, 'stepSince'> = defaultTiming(rules),
  ) {
    this.code = code;
    this.hostToken = hostToken;
    this.botRng = createRng(randomInt(2 ** 32));
  }

  get started() {
    return this.game !== null;
  }

  seatOf(token: string): number {
    return this.seats.findIndex((s) => s?.kind === 'human' && s.token === token);
  }

  get hostSeat(): number {
    return this.seatOf(this.hostToken);
  }

  /**
   * Join (or re-join) the room.
   *
   * @param token   this browser tab's token
   * @param resume  tokens this browser used for this room before (tab was closed / phone killed it).
   *                The first one whose seat is currently DISCONNECTED is reclaimed, so two open
   *                tabs never fight over one seat.
   * @returns the seat and the token now bound to it, or an error.
   */
  join(token: string, name: string, resume: string[] = []): { seat: number; token: string } | { error: string } {
    this.lastActivity = Date.now();
    let existing = this.seatOf(token);
    for (const old of existing < 0 ? resume : []) {
      const seat = this.seatOf(old);
      if (seat >= 0 && !this.seats[seat]!.connected) {
        existing = seat;
        token = old;
        break;
      }
    }
    if (existing >= 0) {
      const seat = this.seats[existing]!;
      seat.connected = true;
      if (!this.started && name) seat.name = name;
      return { seat: existing, token };
    }
    if (this.started) return { error: 'That game has already started.' };
    const free = this.seats.findIndex((s) => s === null);
    if (free < 0) return { error: 'That room is full.' };
    this.seats[free] = { kind: 'human', name: name || `Player ${free + 1}`, token, connected: true, showWaits: false };
    // If the host left the lobby, the first human to arrive becomes host.
    if (this.hostSeat < 0) this.hostToken = token;
    return { seat: free, token };
  }

  /** Leave the lobby (frees the seat). During a game this only marks the player as disconnected. */
  leave(token: string) {
    const seat = this.seatOf(token);
    if (seat < 0) return;
    if (this.started) {
      this.seats[seat]!.connected = false;
      return;
    }
    this.seats[seat] = null;
    if (token === this.hostToken) {
      const next = this.seats.find((s) => s?.kind === 'human');
      if (next?.token) this.hostToken = next.token;
    }
  }

  setConnected(token: string, connected: boolean) {
    const seat = this.seatOf(token);
    if (seat >= 0) this.seats[seat]!.connected = connected;
    this.lastActivity = Date.now();
  }

  addBot(token: string, seat: number): string | null {
    if (token !== this.hostToken) return 'Only the host can change seats.';
    if (this.started) return 'The game has already started.';
    if (!(seat >= 0 && seat < 4) || this.seats[seat] !== null) return 'That seat is taken.';
    this.seats[seat] = { kind: 'bot', name: BOT_NAMES[seat], connected: true, showWaits: false };
    return null;
  }

  removeBot(token: string, seat: number): string | null {
    if (token !== this.hostToken) return 'Only the host can change seats.';
    if (this.started) return 'The game has already started.';
    if (this.seats[seat]?.kind !== 'bot') return 'There is no bot in that seat.';
    this.seats[seat] = null;
    return null;
  }

  start(token: string): string | null {
    if (token !== this.hostToken) return 'Only the host can start the game.';
    if (this.started) return 'The game has already started.';
    for (let i = 0; i < 4; i++) {
      if (this.seats[i] !== null) continue;
      if (!this.rules.fillEmptySeatsWithBots) return 'Fill every seat (or add bots) first.';
      this.seats[i] = { kind: 'bot', name: BOT_NAMES[i], connected: true, showWaits: false };
    }
    const { state, events } = startRound(createGame({ seed: randomInt(2 ** 32), rules: this.rules }));
    this.commit(state, events);
    return null;
  }

  /** A human's game action. Validated by the engine; illegal actions change nothing. */
  act(token: string, action: Action): string | null {
    if (!this.game) return "The game hasn't started yet.";
    const seat = this.seatOf(token);
    if (seat < 0) return "You're not seated in this room.";
    this.lastActivity = Date.now();
    const res = applyAction(this.game, seat, action);
    if ('error' in res) return res.error;
    this.commit(res.state, res.events);
    return null;
  }

  setShowWaits(token: string, on: boolean) {
    const seat = this.seatOf(token);
    if (seat >= 0) this.seats[seat]!.showWaits = on;
  }

  isBot = (seat: number) => this.seats[seat]?.kind === 'bot';

  get claimDeadline() {
    return this.stepSince + this.timing.claimWindowMs;
  }

  /** Store a new game state, notify listeners and re-arm the automatic-step timer. */
  private commit(state: GameState, events: GameEvent[]) {
    if (!this.game || state.stepId !== this.game.stepId) this.stepSince = Date.now();
    this.game = state;
    this.onChange(this, events);
    this.schedule();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.game) return;
    const step = planNextStep(this.game, this.isBot, { ...this.timing, stepSince: this.stepSince });
    if (!step) return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        if (!this.game) return;
        const res = runStep(this.game, step, this.botRng);
        if (res) this.commit(res.state, res.events);
        else this.schedule();
      },
      Math.max(0, step.at - Date.now()),
    );
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Nobody human is connected (room can be cleaned up after a while). */
  get abandoned() {
    return !this.seats.some((s) => s?.kind === 'human' && s.connected);
  }
}

export function defaultTiming(rules: Rules): Omit<Timing, 'stepSince'> {
  return {
    botTurnMs: 900,
    botClaimMs: 400,
    claimMinDelayMs: rules.claimMinDelayMs,
    claimWindowMs: rules.claimWindowMs,
    turnTimerMs: rules.turnTimerMs,
  };
}

export class RoomManager {
  rooms = new Map<string, Room>();

  constructor(
    private readonly onChange: Listener,
    private readonly rules: Rules = RULES,
    private readonly timing?: Omit<Timing, 'stepSince'>,
  ) {}

  create(hostToken: string): Room {
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(code, hostToken, this.onChange, this.rules, this.timing ?? defaultTiming(this.rules));
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Drop rooms nobody has been connected to for `idleMs`. */
  sweep(idleMs: number) {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.abandoned && now - room.lastActivity > idleMs) {
        room.dispose();
        this.rooms.delete(code);
      }
    }
  }
}
