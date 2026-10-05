import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES } from '@mahjong/engine';
import { Room } from '../src/rooms';
import { buildSnapshot } from '../src/views';

// Fast fake-clock timings; the turn timer itself comes from the room setting.
const timing = { botTurnMs: 10, botClaimMs: 5, claimMinDelayMs: 10, claimWindowMs: 50, turnTimerMs: null };
const HOST = 'tok-host0000';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function roomWithHumanAndBots() {
  const room = new Room('TIME', HOST, () => {}, RULES, timing);
  room.join(HOST, 'Me');
  return room;
}

/** Advance the fake clock until `cond` holds (or give up). */
function runUntil(_room: Room, cond: () => boolean, maxMs = 120_000) {
  for (let t = 0; t < maxMs && !cond(); t += 5) vi.advanceTimersByTime(5);
  return cond();
}

describe('turn timer setting', () => {
  it('only the host can change it, only in the lobby, and only to an offered value', () => {
    const room = roomWithHumanAndBots();
    room.join('tok-guest000', 'Guest');
    expect(room.setTurnTimer('tok-guest000', 20000)).toBe('Only the host can change the timer.');
    expect(room.setTurnTimer(HOST, 12345)).toBe("That timer isn't an option.");
    expect(room.setTurnTimer(HOST, 20000)).toBeNull();
    expect(buildSnapshot(room, 0).turnTimerMs).toBe(20000);
    expect(room.setTurnTimer(HOST, null)).toBeNull();
    room.start(HOST);
    expect(room.setTurnTimer(HOST, 40000)).toBe('The game has already started.');
    room.dispose();
  });

  it('with the timer off, the game waits for a human forever (nothing is auto-played)', () => {
    const room = roomWithHumanAndBots();
    room.start(HOST);
    // Let bots play until it's my turn, then wait a long time.
    expect(runUntil(room, () => room.game!.phase === 'AWAIT_DISCARD' && room.game!.turn === 0)).toBe(true);
    const before = JSON.stringify(room.game);
    vi.advanceTimersByTime(10 * 60_000);
    expect(JSON.stringify(room.game)).toBe(before);
    expect(buildSnapshot(room, 0).view!.turnDeadline).toBeUndefined();
    room.dispose();
  });
});

describe('timing out', () => {
  it(`after ${RULES.afkTimeoutsBeforeBot} timeouts in a row a bot plays my seat; "I'm back" takes it back`, () => {
    const room = roomWithHumanAndBots();
    room.setTurnTimer(HOST, 20000);
    room.start(HOST);

    // My turn shows a deadline in my view.
    expect(runUntil(room, () => room.game!.phase === 'AWAIT_DISCARD' && room.game!.turn === 0)).toBe(true);
    expect(buildSnapshot(room, 0).view!.turnDeadline).toBe(room.stepSince + 20000);

    // Do nothing: the timer plays for me until I'm marked away (or the round happens to end first).
    expect(runUntil(room, () => room.seats[0]!.away || room.game!.phase === 'ROUND_END')).toBe(true);
    if (room.game!.phase === 'ROUND_END') return room.dispose(); // rare: someone won before my 2nd timeout
    expect(room.seats[0]!.timeouts).toBe(RULES.afkTimeoutsBeforeBot);
    expect(room.isBot(0)).toBe(true);
    expect(buildSnapshot(room, 0).seats[0].away).toBe(true); // everyone sees the "away" badge

    // While away, my turns are played at bot speed, with no turn deadline shown.
    expect(runUntil(room, () => room.game!.phase === 'AWAIT_DISCARD' && room.game!.turn === 0)).toBe(true);
    expect(buildSnapshot(room, 0).view!.turnDeadline).toBeUndefined();

    // "I'm back"
    expect(room.comeBack(HOST)).toBeNull();
    expect(room.seats[0]!.away).toBe(false);
    expect(room.seats[0]!.timeouts).toBe(0);
    expect(room.isBot(0)).toBe(false);
    room.dispose();
  });

  it('making a move yourself resets the timeout streak', () => {
    const room = roomWithHumanAndBots();
    room.setTurnTimer(HOST, 20000);
    room.start(HOST);
    expect(runUntil(room, () => room.seats[0]!.timeouts === 1 || room.game!.phase === 'ROUND_END')).toBe(true);
    if (room.game!.phase === 'ROUND_END') return room.dispose();
    expect(runUntil(room, () => room.game!.phase === 'AWAIT_DISCARD' && room.game!.turn === 0)).toBe(true);
    const drawn = room.game!.drawn ?? room.game!.players[0].hand[0];
    expect(room.act(HOST, { type: 'discard', tileId: drawn })).toBeNull();
    expect(room.seats[0]!.timeouts).toBe(0);
    room.dispose();
  });
});
