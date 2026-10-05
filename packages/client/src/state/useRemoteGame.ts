/**
 * Online play over Socket.IO.
 *
 * The server sends a full snapshot after every change, so the client just renders
 * the latest one. Reconnects are automatic: when the socket reconnects (Wi-Fi blip,
 * phone sleep, a free host waking up) we re-join the room with the same browser token,
 * and the server hands back the same seat and hand.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Action, GameEvent, PlayerView } from '@mahjong/engine';
import type { GameController } from './types';
import { useBanner } from './useBanner';
import { usePersistentFlag } from './usePersistentFlag';

/** Mirrors packages/server/src/views.ts */
export interface LobbySeat {
  empty: boolean;
  name: string;
  isBot: boolean;
  connected: boolean;
  away: boolean;
}
export interface RoomSnapshot {
  code: string;
  started: boolean;
  mySeat: number;
  hostSeat: number;
  turnTimerMs: number | null;
  turnTimerOptionsMs: readonly number[];
  seats: LobbySeat[];
  view: PlayerView | null;
}

type AckResult = { error?: string; code?: string; seat?: number; token?: string };

/**
 * Identity, without accounts:
 *  - each browser TAB has its own random token (sessionStorage, survives reloads), so
 *    four tabs in one browser are four different players;
 *  - the browser also remembers, per room, the last token it sat with (localStorage).
 *    If the tab was closed or the phone killed it, a new tab sends that as `resume`
 *    and the server gives the seat back (only while that seat is disconnected).
 */
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

function tabToken(): string {
  try {
    let t = sessionStorage.getItem('mj-tab-token');
    if (!t) {
      t = randomToken();
      sessionStorage.setItem('mj-tab-token', t);
    }
    return t;
  } catch {
    return randomToken();
  }
}

function setTabToken(token: string) {
  try {
    sessionStorage.setItem('mj-tab-token', token);
  } catch {
    /* ignore */
  }
}

/** room code -> tokens this browser has sat with in that room (several if several tabs played). */
function roomTokens(): Record<string, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem('mj-room-tokens') ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => Array.isArray(v))) as Record<string, string[]>;
  } catch {
    return {};
  }
}

/** Has this browser sat in this room before? (Then a reload / reopened link rejoins straight away.) */
export function knowsRoom(code: string): boolean {
  return code in roomTokens();
}

function rememberRoomToken(code: string, token: string) {
  try {
    const all = roomTokens();
    const tokens = [token, ...(all[code] ?? []).filter((t) => t !== token)].slice(0, 4);
    // Keep only the last few rooms.
    const others = Object.entries(all).filter(([c]) => c !== code).slice(-4);
    localStorage.setItem('mj-room-tokens', JSON.stringify(Object.fromEntries([...others, [code, tokens]])));
  } catch {
    /* ignore */
  }
}

export interface RemoteRoom {
  connection: GameController['connection'];
  snapshot: RoomSnapshot | null;
  error: string | null;
  /** Fatal join error (bad code, room full...). */
  joinError: string | null;
  addBot: (seat: number) => void;
  removeBot: (seat: number) => void;
  start: () => void;
  setTurnTimer: (ms: number | null) => void;
  leave: () => void;
  controller: GameController | null;
}

/**
 * @param target  { create: true } to make a new room, or { code } to join one.
 * @param onRoomCode  called once we know the room code (to put it in the URL).
 */
export function useRemoteGame(
  target: { create: true } | { code: string },
  name: string,
  onRoomCode: (code: string) => void,
  onLeave: () => void,
): RemoteRoom {
  const [connection, setConnection] = useState<GameController['connection']>('connecting');
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [showWaits, setShowWaitsLocal] = usePersistentFlag('mj-hint', false);
  const { banner, onEvents } = useBanner();
  const socketRef = useRef<Socket | null>(null);
  const codeRef = useRef<string | null>('code' in target ? target.code.toUpperCase() : null);
  const showWaitsRef = useRef(showWaits);
  const callbacks = useRef({ onRoomCode, onLeave });
  useEffect(() => {
    callbacks.current = { onRoomCode, onLeave };
  });
  const wantCreate = 'create' in target;

  useEffect(() => {
    let token = tabToken();
    const socket = io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
    socketRef.current = socket;

    const enter = () => {
      const done = (res: AckResult) => {
        if (res.error) {
          setJoinError(res.error);
          return;
        }
        if (res.token && res.token !== token) {
          // We resumed an older seat: this tab now uses that token.
          token = res.token;
          setTabToken(token);
        }
        if (res.code) codeRef.current = res.code;
        if (codeRef.current) {
          rememberRoomToken(codeRef.current, token);
          callbacks.current.onRoomCode(codeRef.current);
        }
        socket.emit('set_hint', showWaitsRef.current);
      };
      const code = codeRef.current;
      if (code) socket.emit('join_room', { token, name, code, resume: roomTokens()[code] }, done);
      else if (wantCreate) socket.emit('create_room', { token, name }, done);
    };

    socket.on('connect', () => {
      setConnection('connected');
      enter(); // first connect AND every reconnect
    });
    socket.on('disconnect', () => setConnection('reconnecting'));
    socket.io.on('reconnect_attempt', () => setConnection('reconnecting'));
    socket.on('snapshot', (s: RoomSnapshot) => setSnapshot(s));
    socket.on('events', (e: GameEvent[]) => onEvents(e));

    return () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
    // name/target are fixed for the lifetime of this hook (the parent remounts on change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 2500);
    return () => clearTimeout(id);
  }, [error]);

  const send = useCallback((ev: string, payload?: unknown) => {
    socketRef.current?.emit(ev, payload, (res: AckResult) => res?.error && setError(res.error));
  }, []);

  const leave = useCallback(() => {
    const s = socketRef.current;
    if (s?.connected) s.emit('leave_room', null, () => callbacks.current.onLeave());
    else callbacks.current.onLeave();
  }, []);

  const setShowWaits = useCallback(
    (on: boolean) => {
      setShowWaitsLocal(on);
      showWaitsRef.current = on;
      socketRef.current?.emit('set_hint', on);
    },
    [setShowWaitsLocal],
  );

  const act = useCallback((a: Action) => send('action', a), [send]);
  const comeBack = useCallback(() => send('come_back'), [send]);

  const controller = useMemo<GameController | null>(
    () =>
      snapshot?.view
        ? { mode: 'remote', view: snapshot.view, act, error, banner, showWaits, setShowWaits, connection, leave, comeBack }
        : null,
    [snapshot, act, error, banner, showWaits, setShowWaits, connection, leave, comeBack],
  );

  return {
    connection,
    snapshot,
    error,
    joinError,
    addBot: (seat) => send('add_bot', { seat }),
    removeBot: (seat) => send('remove_bot', { seat }),
    start: () => send('start_game'),
    setTurnTimer: (ms) => send('set_turn_timer', { ms }),
    leave,
    controller,
  };
}
