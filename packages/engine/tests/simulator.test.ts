import { describe, it, expect } from 'vitest';
import { botAction } from '../src/bots';
import { applyAction, createGame, legalActions, resolveClaims, startRound } from '../src/game';
import { buildPlayerView } from '../src/view';
import { createRng, type Rng } from '../src/wall';
import type { Action, GameState } from '../src/types';

/** Assert the invariants from brief 8.1 on any state. */
function checkInvariants(s: GameState) {
  const all = [...s.wall];
  for (const p of s.players) {
    all.push(...p.hand, ...p.discards);
    for (const m of p.melds) all.push(...m.tiles);
  }
  // Every one of the 136 tiles is accounted for exactly once.
  if (all.length !== 136) throw new Error(`tile count ${all.length}`);
  if (new Set(all).size !== 136) throw new Error('duplicate tile');
  if (all.some((t) => t < 0 || t > 135)) throw new Error('bad tile id');

  // Hand sizes: (concealed + 3 per meld) is 13, or 14 for the player who must discard / the winner.
  s.players.forEach((p, seat) => {
    const size = p.hand.length + 3 * p.melds.length;
    const holding14 =
      (s.phase === 'AWAIT_DISCARD' && seat === s.turn) ||
      (s.phase === 'ROUND_END' && s.result?.type === 'win' && s.result.winner === seat);
    const expected = holding14 ? 14 : 13;
    if (size !== expected) throw new Error(`seat ${seat} hand size ${size}, expected ${expected} in ${s.phase}`);
    for (const m of p.melds) {
      const n = m.type === 'kong' ? 4 : 3;
      if (m.tiles.length !== n || m.kinds.length !== n) throw new Error('bad meld');
    }
  });

  // Phase-specific sanity.
  if (s.phase === 'CLAIM_WINDOW' && !s.claimWindow) throw new Error('claim window missing');
  if (s.phase !== 'CLAIM_WINDOW' && s.claimWindow) throw new Error('stale claim window');
  if (s.phase === 'ROUND_END' && !s.result) throw new Error('round ended without a result');
}

/** A player that picks a random legal move: exercises pung/chow/kong paths the v1 bots never take. */
function randomAction(s: GameState, seat: number, rng: Rng): Action | null {
  const legal = legalActions(s, seat).filter((a) => a.type !== 'next_round');
  if (legal.length === 0) return null;
  const special = legal.filter((a) => a.type !== 'discard' && a.type !== 'pass');
  if (special.length && rng.next() < 0.7) return special[rng.int(special.length)];
  return legal[rng.int(legal.length)];
}

type Chooser = (s: GameState, seat: number, rng: Rng) => Action | null;

function playRound(start: GameState, choose: Chooser, rng: Rng): { state: GameState; actions: number } {
  let s = start;
  let actions = 0;
  const apply = (seat: number, a: Action) => {
    const res = applyAction(s, seat, a);
    if ('error' in res) throw new Error(`legal action rejected: ${res.error} ${JSON.stringify(a)}`);
    s = res.state;
    actions++;
    checkInvariants(s);
  };
  while (s.phase !== 'ROUND_END') {
    if (actions > 2000) throw new Error('stuck: round did not end');
    if (s.phase === 'AWAIT_DISCARD') {
      const a = choose(s, s.turn, rng);
      if (!a) throw new Error('stuck: turn player has no action');
      apply(s.turn, a);
    } else if (s.phase === 'CLAIM_WINDOW') {
      for (let seat = 0; seat < 4; seat++) {
        if (legalActions(s, seat).length) apply(seat, choose(s, seat, rng) ?? { type: 'pass' });
      }
      s = resolveClaims(s).state;
      checkInvariants(s);
    } else {
      throw new Error(`stuck in phase ${s.phase}`);
    }
    // The per-player view must never contain another player's concealed tiles.
    if (actions % 17 === 0) checkViews(s);
  }
  return { state: s, actions };
}

function checkViews(s: GameState) {
  const seats = [0, 1, 2, 3].map((i) => ({ name: `P${i}`, isBot: true, connected: true }));
  for (let seat = 0; seat < 4; seat++) {
    const v = buildPlayerView(s, seat, { roomCode: 'TEST', seats, showWaits: true });
    const json = JSON.stringify(v);
    if (s.phase !== 'ROUND_END') {
      if (json.includes('"hand"') || v.roundResult) throw new Error('view leaks hands');
      const mine = new Set(s.players[seat].hand);
      for (const t of v.myHand) if (!mine.has(t)) throw new Error('view shows a tile I do not hold');
      if (json.includes('"wall"')) throw new Error('view leaks the wall');
    }
  }
}

function simulate(rounds: number, choose: Chooser, seed: number) {
  const rng = createRng(seed);
  let game = startRound(createGame({ seed })).state;
  const outcomes = { win: 0, draw: 0, selfDraw: 0, melds: 0 };
  for (let r = 0; r < rounds; r++) {
    checkInvariants(game);
    const { state } = playRound(game, choose, rng);
    expect(['win', 'draw']).toContain(state.result!.type);
    if (state.result!.type === 'win') outcomes.win++;
    else outcomes.draw++;
    if (state.result!.winType === 'self-draw') outcomes.selfDraw++;
    outcomes.melds += state.players.reduce((n, p) => n + p.melds.length, 0);
    const next = applyAction(state, 0, { type: 'next_round' });
    if ('error' in next) throw new Error(next.error);
    game = next.state;
  }
  expect(game.tally.reduce((a, b) => a + b, 0)).toBe(outcomes.win);
  return outcomes;
}

describe('simulator', () => {
  it('1,000 bot-vs-bot rounds: invariants hold after every action, every round ends', () => {
    const out = simulate(1000, botAction, 20261005);
    expect(out.win + out.draw).toBe(1000);
    expect(out.win).toBeGreaterThan(0);
  });

  it('1,000 rounds of random legal moves (exercises claims and kongs)', () => {
    const out = simulate(1000, randomAction, 99);
    expect(out.win + out.draw).toBe(1000);
    expect(out.melds).toBeGreaterThan(1000); // claims really happened
  });

  it('is reproducible from the seed', () => {
    const a = simulate(20, botAction, 5);
    const b = simulate(20, botAction, 5);
    expect(a).toEqual(b);
  });
});
