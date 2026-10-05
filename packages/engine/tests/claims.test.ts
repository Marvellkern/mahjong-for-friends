import { describe, it, expect } from 'vitest';
import { legalActions } from '../src/game';
import { RULES } from '../src/rules';
import { kindOf } from '../src/tiles';
import { act, discardKind, k, ks, resolve, setup, tryAct } from './helpers';

// Seat 0 is about to discard. Turn order is 0 -> 1 -> 2 -> 3.
const FILLER = '19m19p19s1234567z'; // 13 unrelated tiles

describe('chow rules', () => {
  it('chow on a wind or dragon is illegal', () => {
    let s = setup({ hands: ['1z' + '2345678m23456p', '23z' + '123456789s12p', FILLER, '258m258p258s4z567z'] });
    s = discardKind(s, 0, '1z');
    expect(s.claimWindow!.options[1].some((a) => a.type === 'claim' && a.claim === 'chow')).toBe(false);
    expect(tryAct(s, 1, { type: 'claim', claim: 'chow', chowKinds: ks('123z') })).toMatch(/can't/i);
  });

  it('chow on 8m with 9m + 1m in hand is illegal (no wrapping)', () => {
    let s = setup({ hands: ['8m' + '2345p23456789s', '19m' + '1234567p234z', '1199p1199s567z', '2356m3456p567s'] });
    s = discardKind(s, 0, '8m');
    expect(legalActions(s, 1).filter((a) => a.type === 'claim' && a.claim === 'chow')).toEqual([]);
    expect(tryAct(s, 1, { type: 'claim', claim: 'chow', chowKinds: [k('8m'), k('9m'), k('1p')] })).not.toBeNull();
  });

  it('chow is only legal from the previous player', () => {
    let s = setup({ hands: ['5m' + '1239p123456789s', '19p19s1234567z', '46m' + '12345678p23s', '369m258p258s1z56z'] });
    s = discardKind(s, 0, '5m');
    expect(tryAct(s, 2, { type: 'claim', claim: 'chow', chowKinds: ks('456m') })).toBe("You can't chow from that player.");
  });

  it('chow from anyone is allowed when RULES.chowOnlyFromPrevious is false', () => {
    const rules = { ...RULES, chowOnlyFromPrevious: false };
    let s = setup({ rules, hands: ['5m' + '1239p123456789s', '19p19s1234567z', '46m' + '12345678p23s', '369m258p258s1z56z'] });
    s = discardKind(s, 0, '5m');
    s = act(s, 2, { type: 'claim', claim: 'chow', chowKinds: ks('456m') });
    s = resolve(s);
    expect(s.players[2].melds[0].type).toBe('chow');
  });

  it('offers every way a chow can be formed', () => {
    let s = setup({ hands: ['5m' + '1239p123456789s', '3467m' + '12345p1z23z', FILLER, '369m258p258s1z56z'] });
    s = discardKind(s, 0, '5m');
    const chows = legalActions(s, 1).filter((a) => a.type === 'claim' && a.claim === 'chow');
    expect(chows.map((a) => (a as { chowKinds: number[] }).chowKinds)).toEqual([ks('345m'), ks('456m'), ks('567m')]);
  });
});

describe('claim priority', () => {
  it('pung beats chow', () => {
    let s = setup({ hands: ['5m' + '1239p123456789s', '46m' + '12345678p23z', '55m' + '1234567p234z', '369m258p258s1z56z'] });
    s = discardKind(s, 0, '5m');
    s = act(s, 1, { type: 'claim', claim: 'chow', chowKinds: ks('456m') });
    s = act(s, 2, { type: 'claim', claim: 'pung' });
    s = resolve(s);
    expect(s.players[2].melds).toHaveLength(1);
    expect(s.players[2].melds[0].type).toBe('pung');
    expect(s.players[1].melds).toHaveLength(0);
    expect(s.turn).toBe(2);
    expect(s.phase).toBe('AWAIT_DISCARD');
    // the claimed tile left the discarder's river
    expect(s.players[0].discards).toHaveLength(0);
  });

  it('two players claim win on the same discard: the one closest after the discarder wins', () => {
    let s = setup({
      hands: ['1z' + '2345678m23456p', '19m19p19s234567z', '123m456m789m123p1z', '123s456s789s456p1z'],
    });
    s = discardKind(s, 0, '1z');
    s = act(s, 3, { type: 'claim', claim: 'win' });
    s = act(s, 2, { type: 'claim', claim: 'win' });
    s = resolve(s);
    expect(s.phase).toBe('ROUND_END');
    expect(s.result).toMatchObject({ type: 'win', winner: 2, winType: 'discard', from: 0 });
    expect(s.tally).toEqual([0, 0, 1, 0]);
  });

  it('closest after discarder also wraps around the table', () => {
    // Seat 2 discards; seats 3 and 1 both win -> seat 3 is closer.
    let s = setup({
      turn: 2,
      hands: ['19m19p19s234567z', '123m456m789m123p1z', '1z' + '2345678m23456p', '123s456s789s456p1z'],
    });
    s = discardKind(s, 2, '1z');
    s = act(s, 1, { type: 'claim', claim: 'win' });
    s = act(s, 3, { type: 'claim', claim: 'win' });
    expect(resolve(s).result!.winner).toBe(3);
  });

  it('win beats pung', () => {
    let s = setup({ hands: ['5m' + '1239p123456789s', '55m' + '12345678p23z', '123m789m456p789s5m', '369m258p258s1z67z'] });
    s = discardKind(s, 0, '5m');
    s = act(s, 1, { type: 'claim', claim: 'pung' });
    s = act(s, 2, { type: 'claim', claim: 'win' });
    expect(resolve(s).result!.winner).toBe(2);
  });

  it('unanswered claims count as a pass; nobody claiming -> next player draws', () => {
    let s = setup({ hands: ['5m' + '1239p123456789s', '46m' + '12345678p23z', '55m' + '1234567p234z', '369m258p258s1z56z'] });
    s = discardKind(s, 0, '5m');
    const wallBefore = s.wall.length;
    const handBefore = s.players[1].hand.length;
    s = resolve(s); // nobody answered in time
    expect(s.turn).toBe(1);
    expect(s.players[1].hand).toHaveLength(handBefore + 1);
    expect(s.wall).toHaveLength(wallBefore - 1);
    expect(s.players[0].discards).toHaveLength(1);
  });

  it('turn order continues from the claimer', () => {
    let s = setup({ hands: ['5m' + '1239p123456789s', '46m' + '12345678p23z', '55m' + '1234567p234z', '369m258p258s1z56z'] });
    s = discardKind(s, 0, '5m');
    s = act(s, 2, { type: 'claim', claim: 'pung' });
    s = resolve(s);
    expect(legalActions(s, 2).some((a) => a.type === 'declare_win')).toBe(false); // claimed, not drawn
    s = discardKind(s, 2, '2z');
    s = resolve(s);
    expect(s.turn).toBe(3);
  });

  it('players without a legal claim get no claim window', () => {
    let s = setup({ hands: ['5m' + '1239p123456789s', '19p19s1234567z', '55m' + '1234567p234z', '19m19p19s1234567z'.replace('19m', '18m')] });
    s = discardKind(s, 0, '5m');
    expect(legalActions(s, 1)).toEqual([]);
    expect(legalActions(s, 3)).toEqual([]);
    expect(legalActions(s, 2).length).toBeGreaterThan(0);
  });
});

describe('kongs', () => {
  it('kong claim: takes the tile, shows the meld, draws a replacement from the wall end', () => {
    let s = setup({
      hands: ['5m' + '1239p123456789s', '19p19s1234567z', '555m' + '123456p234z5z', '369m258p258s1z67z'],
      wallEnd: '7z',
    });
    s = discardKind(s, 0, '5m');
    s = act(s, 2, { type: 'claim', claim: 'kong' });
    s = resolve(s);
    const p = s.players[2];
    expect(p.melds[0]).toMatchObject({ type: 'kong', open: true, from: 0 });
    expect(p.melds[0].tiles).toHaveLength(4);
    expect(kindOf(s.drawn!)).toBe(k('7z'));
    expect(s.drawSource).toBe('kong');
    expect(p.hand).toHaveLength(11); // 14 - 3 = 11 concealed (kong counts as one set)
    expect(s.turn).toBe(2);
  });

  it('concealed kong on your own turn, then win on the replacement counts as self-draw', () => {
    let s = setup({
      hands: ['1111m234m567p78s99s', '19p19s1234567z', '29m28p28s2345z67z', '369m258p258s1z56z'],
      wallEnd: '9s',
    });
    expect(legalActions(s, 0)).toContainEqual({ type: 'concealed_kong', kind: k('1m') });
    s = act(s, 0, { type: 'concealed_kong', kind: k('1m') });
    expect(s.players[0].melds[0]).toMatchObject({ type: 'kong', open: false });
    // hand is now 234m 567p 78s 99s + replacement 9s = 234m 567p 789s 99s -> complete with the kong
    expect(legalActions(s, 0)).toContainEqual({ type: 'declare_win' });
    s = act(s, 0, { type: 'declare_win' });
    expect(s.result).toMatchObject({ type: 'win', winner: 0, winType: 'self-draw' });
  });

  it('added kong upgrades an open pung', () => {
    let s = setup({ hands: ['5m' + '1239p123456789s', '19p19s1234567z', '55m' + '5m' + '123456p23z', '369m258p258s1z67z'] });
    s = discardKind(s, 0, '5m');
    // seat 2 only pungs (keeping the 4th 5m), discards, and later upgrades.
    s = act(s, 2, { type: 'claim', claim: 'pung' });
    s = resolve(s);
    expect(legalActions(s, 2).some((a) => a.type === 'added_kong')).toBe(false); // not right after a claim
    s = discardKind(s, 2, '2z');
    // everyone passes around back to seat 2
    s = resolve(s); // seat 3 draws
    s = act(s, 3, { type: 'discard', tileId: s.drawn! });
    s = resolve(s);
    s = act(s, 0, { type: 'discard', tileId: s.drawn! });
    s = resolve(s);
    s = act(s, 1, { type: 'discard', tileId: s.drawn! });
    s = resolve(s);
    expect(s.turn).toBe(2);
    expect(legalActions(s, 2)).toContainEqual({ type: 'added_kong', kind: k('5m') });
    s = act(s, 2, { type: 'added_kong', kind: k('5m') });
    expect(s.players[2].melds[0]).toMatchObject({ type: 'kong' });
    expect(s.players[2].melds[0].tiles).toHaveLength(4);
    expect(s.drawSource).toBe('kong');
  });
});

describe('winning and round end', () => {
  it('self-draw win is legal with a complete hand', () => {
    const s = setup({ hands: ['123m456m789m123p11z', '19p19s1234567z', '29m28p28s2345z67z', '369m258p258s1z56z'] });
    expect(legalActions(s, 0)).toContainEqual({ type: 'declare_win' });
  });

  it('winOnSelfDraw=false disables self-draw wins', () => {
    const s = setup({
      rules: { ...RULES, winOnSelfDraw: false },
      hands: ['123m456m789m123p11z', '19p19s1234567z', '29m28p28s2345z67z', '369m258p258s1z56z'],
    });
    expect(legalActions(s, 0)).not.toContainEqual({ type: 'declare_win' });
  });

  it('win check uses open melds: 3 melds + a set + a pair', () => {
    let s = setup({ hands: ['5m' + '1239p123456789s', '19p19s1234567z', '55m' + '123p456p11z23z', '369m258p258s1z67z'] });
    s.players[2].melds = [
      { type: 'pung', kinds: ks('777s'), tiles: [], open: true },
      { type: 'chow', kinds: ks('123s'), tiles: [], open: true },
    ];
    // seat 2 concealed: 55m 123p 456p 11z 23z (11 tiles) + 2 melds. Not winning on 5m.
    s = discardKind(s, 0, '5m');
    expect(legalActions(s, 2).some((a) => a.type === 'claim' && a.claim === 'win')).toBe(false);
  });

  it('wall empty and nobody claims -> draw round', () => {
    let s = setup({ emptyWall: true, hands: ['5m' + '1239p123456789s', '19p19s1234567z', '29m28p28s2345z67z', '369m258p258s1z67z'] });
    s = discardKind(s, 0, '5m');
    s = resolve(s);
    expect(s.phase).toBe('ROUND_END');
    expect(s.result).toEqual({ type: 'draw' });
  });

  it('kong is not offered when no replacement tile is left', () => {
    let s = setup({ emptyWall: true, hands: ['5m' + '1239p123456789s', '19p19s1234567z', '555m' + '123456p234z', '369m258p258s1z67z'] });
    s = discardKind(s, 0, '5m');
    expect(s.claimWindow!.options[2].some((a) => a.type === 'claim' && a.claim === 'kong')).toBe(false);
    expect(s.claimWindow!.options[2].some((a) => a.type === 'claim' && a.claim === 'pung')).toBe(true);
  });

  it('illegal actions return an error and change nothing', () => {
    const s = setup({ hands: ['123m456m789m123p11z', '19p19s1234567z', '29m28p28s2345z67z', '369m258p258s1z56z'] });
    const before = JSON.stringify(s);
    expect(tryAct(s, 1, { type: 'discard', tileId: s.players[1].hand[0] })).toBe("It's not your turn.");
    expect(tryAct(s, 0, { type: 'discard', tileId: s.players[1].hand[0] })).toBe("You don't have that tile.");
    expect(JSON.stringify(s)).toBe(before);
  });
});
