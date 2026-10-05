import { describe, it, expect } from 'vitest';
import { planNextStep, runStep, type Timing } from '../src/autoplay';
import { createRng } from '../src/wall';
import { buildPlayerView } from '../src/view';
import { formatKinds } from '../src/notation';
import { kindOf } from '../src/tiles';
import { act, discardKind, setup } from './helpers';

const T: Timing = { stepSince: 1000, botTurnMs: 500, botClaimMs: 300, claimMinDelayMs: 1200, claimWindowMs: 10000, turnTimerMs: null };
const seats = [0, 1, 2, 3].map((i) => ({ name: `P${i}`, isBot: i !== 0, connected: true }));

describe('autoplay planner', () => {
  const base = () => setup({ hands: ['5m' + '1239p123456789s', '46m' + '12345678p23z', '55m' + '1234567p234z', '369m258p258s1z56z'] });

  it('waits for a human turn (no turn timer by default)', () => {
    expect(planNextStep(base(), (s) => s !== 0, T)).toBeNull();
  });

  it('turn timer auto-discards the drawn tile when enabled', () => {
    const s = base();
    const step = planNextStep(s, () => false, { ...T, turnTimerMs: 30000 })!;
    expect(step).toEqual({ kind: 'turn_timeout', seat: 0, at: 31000 });
    const res = runStep(s, step, createRng(1))!;
    expect(res.state.players[0].discards).toEqual([s.drawn]);
  });

  it('bots answer claims first, then the window resolves no earlier than the minimum delay', () => {
    let s = discardKind(base(), 0, '5m');
    const isBot = (seat: number) => seat !== 1; // seat 1 (human) can chow, seat 2 (bot) can pung
    let step = planNextStep(s, isBot, T)!;
    expect(step).toEqual({ kind: 'bot', seat: 2, at: 1300 });
    s = runStep(s, step, createRng(1))!.state; // bot passes (v1 bots only claim wins)
    step = planNextStep(s, isBot, T)!;
    expect(step).toEqual({ kind: 'resolve_claims', at: 11000 }); // human still deciding
    s = act(s, 1, { type: 'pass' });
    expect(planNextStep(s, isBot, T)).toEqual({ kind: 'resolve_claims', at: 2200 });
  });

  it('nobody eligible: still waits the minimum delay', () => {
    const s = setup({ hands: ['1z' + '2345678m23456p', '19p19s234567z', '1239m1239p1239s', '2345678s4567p'] });
    const d = discardKind(s, 0, '1z');
    expect(planNextStep(d, () => true, T)).toEqual({ kind: 'resolve_claims', at: 2200 });
  });
});

describe('player view', () => {
  it('separates the drawn tile and shows waits only with the hint on', () => {
    let s = setup({ hands: ['123m456m789m123p1z7z', '19p19s1234567z', '29m28p28s2345z6z', '369m258p258s1z56z'] });
    let v = buildPlayerView(s, 0, { roomCode: 'X', seats, showWaits: true });
    expect(v.myDrawnTile).toBe(s.drawn);
    expect(v.myHand).not.toContain(s.drawn);
    expect(v.waits).toBeUndefined(); // 14 tiles: not "one away" yet
    s = discardKind(s, 0, '7z');
    v = buildPlayerView(s, 0, { roomCode: 'X', seats, showWaits: true });
    expect(formatKinds(v.waits!)).toBe('1z');
    expect(buildPlayerView(s, 0, { roomCode: 'X', seats }).waits).toBeUndefined();
  });

  it("never includes other players' concealed tiles before the round ends", () => {
    const s = setup({ hands: ['123m456m789m123p11z', '19p19s1234567z', '29m28p28s2345z6z', '369m258p258s1z56z'] });
    const v = buildPlayerView(s, 1, { roomCode: 'X', seats });
    const others = [0, 2, 3].flatMap((i) => s.players[i].hand);
    expect(v.myHand.some((t) => others.includes(t))).toBe(false);
    expect(v.seats[0].handCount).toBe(14);
    expect(v.roundResult).toBeUndefined();
    expect(v.legalActions).toEqual([]);
    const won = act(s, 0, { type: 'declare_win' });
    const end = buildPlayerView(won, 1, { roomCode: 'X', seats });
    expect(end.roundResult!.hands![0].map(kindOf)).toHaveLength(14);
  });
});
