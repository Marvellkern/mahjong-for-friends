/**
 * HTTP + Socket.IO server. In production ONE Node process serves the built client
 * and the websocket, so it deploys as a single service.
 *
 * Client -> server (all with an ack callback):
 *   create_room {token, name}            -> { code } | { error }
 *   join_room   {token, name, code}      -> { seat } | { error }
 *   leave_room
 *   add_bot {seat} / remove_bot {seat}   (host only, lobby only)
 *   start_game                           (host only)
 *   action <Action>                      -> {} | { error }
 *   set_hint <boolean>
 * Server -> client:
 *   snapshot <RoomSnapshot>   full snapshot after every change (reconnects are trivial)
 *   events   <GameEvent[]>    public events, for call banners and sounds
 */
import express from 'express';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Server, type Socket } from 'socket.io';
import { RULES, type Action, type GameEvent, type Rules, type Timing } from '@mahjong/engine';
import { RoomManager, type Room } from './rooms';
import { buildSnapshot } from './views';

type Ack = (res: Record<string, unknown>) => void;

interface SocketData {
  token?: string;
  code?: string;
}

export interface ServerOptions {
  /** Folder with the built client (index.html). Optional in dev/tests. */
  clientDir?: string;
  rules?: Rules;
  timing?: Omit<Timing, 'stepSince'>;
}

export function createServer(opts: ServerOptions = {}): { http: HttpServer; io: Server; rooms: RoomManager } {
  const app = express();
  const http = createHttpServer(app);
  const io = new Server(http, { pingInterval: 10_000, pingTimeout: 8_000 });

  // Which sockets are looking at which room (several tabs may share one seat token).
  const sockets = new Map<string, Set<Socket>>();

  const broadcast = (room: Room, events: GameEvent[]) => {
    for (const s of sockets.get(room.code) ?? []) {
      const data = s.data as SocketData;
      const seat = data.token ? room.seatOf(data.token) : -1;
      if (seat < 0) continue;
      s.emit('snapshot', buildSnapshot(room, seat));
      if (events.length) s.emit('events', events);
    }
  };

  const rooms = new RoomManager(broadcast, opts.rules ?? RULES, opts.timing);
  // Clean up rooms nobody has been connected to for 30 minutes.
  const sweeper = setInterval(() => rooms.sweep(30 * 60_000), 5 * 60_000);
  sweeper.unref();
  http.on('close', () => clearInterval(sweeper));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, rooms: rooms.rooms.size });
  });

  if (opts.clientDir && existsSync(path.join(opts.clientDir, 'index.html'))) {
    app.use(express.static(opts.clientDir, { index: false, maxAge: '1h' }));
    // Single-page app: every other GET returns index.html (e.g. /?room=ABCD).
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(opts.clientDir!, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } });
    });
  }

  io.on('connection', (socket) => {
    const data = socket.data as SocketData;
    const ack = (fn: unknown): Ack => (typeof fn === 'function' ? (fn as Ack) : () => {});

    const enter = (room: Room, token: string) => {
      leaveSocketRoom();
      data.token = token;
      data.code = room.code;
      if (!sockets.has(room.code)) sockets.set(room.code, new Set());
      sockets.get(room.code)!.add(socket);
    };
    const leaveSocketRoom = () => {
      if (data.code) sockets.get(data.code)?.delete(socket);
    };
    const currentRoom = () => (data.code ? rooms.get(data.code) : undefined);
    const tokenSeated = () => !!data.token && !!currentRoom() && currentRoom()!.seatOf(data.token) >= 0;

    socket.on('create_room', (payload: unknown, cb: unknown) => {
      const { token, name } = parseIdentity(payload);
      if (!token) return ack(cb)({ error: 'Missing player token.' });
      const room = rooms.create(token);
      room.join(token, name);
      enter(room, token);
      ack(cb)({ code: room.code });
      broadcast(room, []);
    });

    socket.on('join_room', (payload: unknown, cb: unknown) => {
      const { token, name } = parseIdentity(payload);
      const p = (payload ?? {}) as { code?: unknown; resume?: unknown };
      const code = typeof p.code === 'string' ? p.code : '';
      const resume = (Array.isArray(p.resume) ? p.resume.slice(0, 4) : [p.resume]).map((t) => parseIdentity({ token: t }).token).filter(Boolean);
      if (!token) return ack(cb)({ error: 'Missing player token.' });
      const room = rooms.get(code.trim());
      if (!room) return ack(cb)({ error: "That room doesn't exist (the server may have restarted)." });
      const res = room.join(token, name, resume);
      if ('error' in res) return ack(cb)(res);
      enter(room, res.token);
      // Tell the client which token owns its seat (it may have resumed an older one).
      ack(cb)({ seat: res.seat, token: res.token });
      broadcast(room, []);
    });

    socket.on('leave_room', (_p: unknown, cb: unknown) => {
      const room = currentRoom();
      if (room && data.token) {
        room.leave(data.token);
        leaveSocketRoom();
        broadcast(room, []);
      }
      data.code = undefined;
      ack(cb)({});
    });

    const hostCommand = (fn: (room: Room, token: string) => string | null) => (_p: unknown, cb: unknown) => {
      const room = currentRoom();
      if (!room || !tokenSeated()) return ack(cb)({ error: 'Join a room first.' });
      const err = fn(room, data.token!);
      if (err) return ack(cb)({ error: err });
      ack(cb)({});
      broadcast(room, []);
    };
    const seatArg = (p: unknown) => Number((p as { seat?: unknown })?.seat);
    socket.on('add_bot', (p: unknown, cb: unknown) => hostCommand((room, t) => room.addBot(t, seatArg(p)))(p, cb));
    socket.on('remove_bot', (p: unknown, cb: unknown) => hostCommand((room, t) => room.removeBot(t, seatArg(p)))(p, cb));
    socket.on('start_game', (p: unknown, cb: unknown) => hostCommand((room, t) => room.start(t))(p, cb));

    socket.on('action', (payload: unknown, cb: unknown) => {
      const room = currentRoom();
      if (!room || !tokenSeated()) return ack(cb)({ error: 'Join a room first.' });
      const action = sanitizeAction(payload);
      if (!action) return ack(cb)({ error: "That move isn't allowed right now." });
      const err = room.act(data.token!, action); // commit() broadcasts on success
      ack(cb)(err ? { error: err } : {});
    });

    socket.on('set_hint', (on: unknown) => {
      const room = currentRoom();
      if (!room || !data.token) return;
      room.setShowWaits(data.token, on === true);
      broadcast(room, []);
    });

    socket.on('disconnect', () => {
      const room = currentRoom();
      leaveSocketRoom();
      if (!room || !data.token) return;
      // Only mark disconnected if no other tab is still using this seat.
      const stillHere = [...(sockets.get(room.code) ?? [])].some((s) => (s.data as SocketData).token === data.token);
      if (!stillHere) {
        room.setConnected(data.token, false);
        broadcast(room, []);
      }
    });
  });

  return { http, io, rooms };
}

function parseIdentity(payload: unknown): { token: string; name: string } {
  const p = (payload ?? {}) as { token?: unknown; name?: unknown };
  const token = typeof p.token === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(p.token) ? p.token : '';
  const name = typeof p.name === 'string' ? p.name.replace(/\p{Cc}/gu, '').trim().slice(0, 16) : '';
  return { token, name };
}

const isInt = (x: unknown): x is number => Number.isInteger(x);

/** Rebuild the action from known fields only; anything malformed is rejected. */
export function sanitizeAction(a: unknown): Action | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  switch (o.type) {
    case 'discard':
      return isInt(o.tileId) ? { type: 'discard', tileId: o.tileId } : null;
    case 'claim': {
      if (o.claim !== 'win' && o.claim !== 'pung' && o.claim !== 'kong' && o.claim !== 'chow') return null;
      if (o.claim !== 'chow') return { type: 'claim', claim: o.claim };
      const ks = o.chowKinds;
      if (!Array.isArray(ks) || ks.length !== 3 || !ks.every(isInt)) return null;
      return { type: 'claim', claim: 'chow', chowKinds: ks as number[] };
    }
    case 'concealed_kong':
    case 'added_kong':
      return isInt(o.kind) ? { type: o.type, kind: o.kind } : null;
    case 'pass':
    case 'declare_win':
    case 'next_round':
      return { type: o.type };
    default:
      return null;
  }
}
