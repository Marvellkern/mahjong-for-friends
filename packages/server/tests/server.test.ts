import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { Action, GameEvent } from '@mahjong/engine';
import { RULES } from '@mahjong/engine';
import { createServer, sanitizeAction } from '../src/app';
import { Room } from '../src/rooms';
import type { RoomSnapshot } from '../src/views';

// Fast timers so a whole round plays in a second or two.
const timing = { botTurnMs: 5, botClaimMs: 1, claimMinDelayMs: 5, claimWindowMs: 300, turnTimerMs: null };

let server: ReturnType<typeof createServer>;
let url: string;
const clients: Socket[] = [];

beforeEach(async () => {
  server = createServer({ timing });
  await new Promise<void>((r) => server.http.listen(0, r));
  url = `http://localhost:${(server.http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  clients.forEach((c) => c.disconnect());
  clients.length = 0;
  for (const room of server.rooms.rooms.values()) room.dispose();
  server.io.close();
  await new Promise((r) => server.http.close(r));
});

interface Player {
  socket: Socket;
  token: string;
  snap: RoomSnapshot | null;
  events: GameEvent[];
}

async function player(token: string): Promise<Player> {
  const socket = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  const p: Player = { socket, token, snap: null, events: [] };
  socket.on('snapshot', (s: RoomSnapshot) => (p.snap = s));
  socket.on('events', (e: GameEvent[]) => p.events.push(...e));
  await new Promise<void>((r) => socket.on('connect', () => r()));
  return p;
}

const emit = <T = Record<string, unknown>>(p: Player, ev: string, payload?: unknown) =>
  new Promise<T>((r) => p.socket.emit(ev, payload, (res: T) => r(res)));

const until = async (cond: () => boolean, ms = 5000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

/** A dumb human: win if possible, otherwise pass on claims and discard the drawn tile. */
function choose(snap: RoomSnapshot): Action | null {
  const legal = snap.view?.legalActions ?? [];
  const win = legal.find((a) => a.type === 'declare_win' || (a.type === 'claim' && a.claim === 'win'));
  if (win) return win;
  if (legal.some((a) => a.type === 'pass')) return { type: 'pass' };
  const discards = legal.filter((a) => a.type === 'discard');
  return discards.length ? discards[discards.length - 1] : null;
}

describe('rooms over Socket.IO', () => {
  it('4 players create/join a room and play a full round; nobody ever sees hidden tiles', async () => {
    const ps = await Promise.all(['tok-aaaaaaaa', 'tok-bbbbbbbb', 'tok-cccccccc', 'tok-dddddddd'].map(player));
    const { code } = await emit<{ code: string }>(ps[0], 'create_room', { token: ps[0].token, name: 'Ana' });
    expect(code).toMatch(/^[A-Z]{4}$/);
    for (const [i, p] of ps.slice(1).entries()) {
      expect(await emit(p, 'join_room', { token: p.token, name: `P${i + 1}`, code: code.toLowerCase() })).toEqual({ seat: i + 1, token: p.token });
    }
    // Only the host can start.
    expect(await emit(ps[1], 'start_game')).toEqual({ error: 'Only the host can start the game.' });
    expect(await emit(ps[0], 'start_game')).toEqual({});
    await until(() => ps.every((p) => p.snap?.view?.phase === 'AWAIT_DISCARD'));

    let leaks = 0;
    let guard = 0;
    while (!ps[0].events.some((e) => e.type === 'win' || e.type === 'round_draw')) {
      if (++guard > 5000) throw new Error('round never ended');
      // Privacy: my hand never overlaps anyone else's, and no token is ever sent.
      const hands = ps.map((p) => new Set([...(p.snap!.view!.myHand ?? []), ...(p.snap!.view!.myDrawnTile !== undefined ? [p.snap!.view!.myDrawnTile] : [])]));
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) for (const t of hands[a]) if (hands[b].has(t)) leaks++;
      for (const p of ps) if (JSON.stringify(p.snap).includes('tok-')) leaks++;

      const acted = ps.map((p) => {
        const a = p.snap && choose(p.snap);
        return a ? emit(p, 'action', a) : null;
      });
      await Promise.all(acted.filter(Boolean));
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(leaks).toBe(0);
    await until(() => ps.every((p) => p.snap?.view?.phase === 'ROUND_END'));
    const end = ps[0].snap!.view!;
    // At round end every hand is revealed.
    expect(Object.keys(end.roundResult!.hands!)).toHaveLength(4);
  });

  it('malformed actions and impossible moves get an error over the socket', async () => {
    // Only moves that are illegal no matter whose turn it is: the fast bots keep playing meanwhile.
    const [a, b] = await Promise.all([player('tok-11111111'), player('tok-22222222')]);
    const { code } = await emit<{ code: string }>(a, 'create_room', { token: a.token, name: 'A' });
    await emit(b, 'join_room', { token: b.token, name: 'B', code });
    await emit(a, 'start_game');
    await until(() => !!a.snap?.view && !!b.snap?.view);
    expect((await emit<{ error?: string }>(a, 'action', { type: 'discard', tileId: 999 })).error).toBeTruthy();
    expect((await emit<{ error?: string }>(a, 'action', { type: 'claim', claim: 'chow', chowKinds: 'nope' })).error).toBeTruthy();
    expect((await emit<{ error?: string }>(a, 'action', null)).error).toBeTruthy();
  });

  it('reconnecting with the same token restores the same seat and hand', async () => {
    const host = await player('tok-hosthost');
    const { code } = await emit<{ code: string }>(host, 'create_room', { token: host.token, name: 'Host' });
    const guest = await player('tok-guestgue');
    await emit(guest, 'join_room', { token: guest.token, name: 'Guest', code });
    await emit(host, 'start_game');
    await until(() => !!guest.snap?.view);
    const hand = guest.snap!.view!.myHand;
    const seat = guest.snap!.mySeat;

    guest.socket.disconnect();
    await until(() => host.snap!.seats[seat].connected === false);

    const again = await player('tok-guestgue');
    expect(await emit(again, 'join_room', { token: again.token, name: 'Guest', code })).toEqual({ seat, token: again.token });
    await until(() => !!again.snap?.view);
    expect(again.snap!.view!.myHand.length).toBeGreaterThan(0);
    expect(again.snap!.view!.myHand.filter((t) => hand.includes(t)).length).toBeGreaterThanOrEqual(hand.length - 3);
    await until(() => host.snap!.seats[seat].connected === true);
  });

  it('a new tab can resume a DISCONNECTED seat with the stored resume token, but never steal a connected one', async () => {
    const host = await player('tok-hostresu');
    const { code } = await emit<{ code: string }>(host, 'create_room', { token: host.token, name: 'Host' });
    const guest = await player('tok-oldtab01');
    await emit(guest, 'join_room', { token: guest.token, name: 'Guest', code });
    await emit(host, 'start_game');
    // While the old tab is still connected, a new tab with the resume token can't take the seat.
    const thief = await player('tok-newtab01');
    expect(await emit(thief, 'join_room', { token: thief.token, name: 'X', code, resume: ['tok-newtab01', 'tok-oldtab01'] })).toEqual({
      error: 'That game has already started.',
    });
    guest.socket.disconnect();
    await until(() => host.snap!.seats[1].connected === false);
    const fresh = await player('tok-newtab02');
    expect(await emit(fresh, 'join_room', { token: fresh.token, name: 'Guest', code, resume: ['tok-newtab01', 'tok-oldtab01'] })).toEqual({
      seat: 1,
      token: 'tok-oldtab01',
    });
    await until(() => fresh.snap?.mySeat === 1 && !!fresh.snap.view);
  });

  it('a stranger cannot join a started game; unknown rooms are reported', async () => {
    const host = await player('tok-host2222');
    const { code } = await emit<{ code: string }>(host, 'create_room', { token: host.token, name: 'Host' });
    await emit(host, 'start_game');
    const late = await player('tok-late2222');
    expect(await emit(late, 'join_room', { token: late.token, name: 'Late', code })).toEqual({ error: 'That game has already started.' });
    expect((await emit<{ error?: string }>(late, 'join_room', { token: late.token, name: 'Late', code: 'ZZZZ' })).error).toMatch(/doesn't exist/);
  });
});

describe('Room (no network, bots frozen)', () => {
  it("an illegal move returns an error and leaves the game exactly as it was", () => {
    // Bots never get to move here, so the turn can't change under us.
    const frozen = { botTurnMs: 1e9, botClaimMs: 1e9, claimMinDelayMs: 1e9, claimWindowMs: 1e9, turnTimerMs: null };
    const room = new Room('TEST', 'tok-host0000', () => {}, RULES, frozen);
    room.join('tok-host0000', 'A');
    room.join('tok-guest000', 'B');
    expect(room.start('tok-host0000')).toBeNull();
    const game = room.game!;
    const notOnTurn = game.turn === 0 ? 'tok-guest000' : 'tok-host0000';
    const seat = room.seatOf(notOnTurn);
    const before = JSON.stringify(room.game);
    expect(room.act(notOnTurn, { type: 'discard', tileId: game.players[seat].hand[0] })).toBe("It's not your turn.");
    expect(room.act('tok-stranger', { type: 'pass' })).toBe("You're not seated in this room.");
    expect(JSON.stringify(room.game)).toBe(before);
    room.dispose();
  });
});

describe('sanitizeAction', () => {
  it('keeps only known fields', () => {
    expect(sanitizeAction({ type: 'discard', tileId: 5, extra: 1 })).toEqual({ type: 'discard', tileId: 5 });
    expect(sanitizeAction({ type: 'discard', tileId: '5' })).toBeNull();
    expect(sanitizeAction({ type: 'claim', claim: 'chow', chowKinds: [1, 2, 3] })).toEqual({ type: 'claim', claim: 'chow', chowKinds: [1, 2, 3] });
    expect(sanitizeAction({ type: 'hack' })).toBeNull();
    expect(sanitizeAction('discard')).toBeNull();
  });
});
