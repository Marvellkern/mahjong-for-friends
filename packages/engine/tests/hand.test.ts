import { describe, it, expect } from 'vitest';
import { canWin, waits } from '../src/hand';
import { countsFromKinds } from '../src/tiles';
import { parseKinds, formatKinds, parseTiles } from '../src/notation';

const counts = (s: string) => countsFromKinds(parseKinds(s));
const win = (s: string, melds = 0) => canWin(counts(s), melds);
const waitsOf = (s: string, melds = 0) => formatKinds(waits(counts(s), melds));

describe('notation', () => {
  it('parses and formats shorthand', () => {
    expect(parseKinds('123m')).toEqual([0, 1, 2]);
    expect(parseKinds('1p9s7z')).toEqual([9, 26, 33]);
    expect(formatKinds(parseKinds('11z123m456p789s'))).toBe('123m456p789s11z');
  });
  it('rejects bad input and 5th copies', () => {
    expect(() => parseKinds('8z')).toThrow();
    expect(() => parseKinds('123')).toThrow();
    expect(() => parseTiles('11111m')).toThrow();
  });
});

describe('canWin (brief 8.1)', () => {
  it('123m456m789m123p11z, 0 melds -> win', () => {
    expect(win('123m456m789m123p11z')).toBe(true);
  });
  it('111m234m567p789s99s, 0 melds -> win (pung + 3 chows + pair)', () => {
    expect(win('111m234m567p789s99s')).toBe(true);
  });
  it('123m456m789m123p12z -> not a win (no pair)', () => {
    expect(win('123m456m789m123p12z')).toBe(false);
  });
  it('seven pairs 1133m5577p224466s -> NOT a win in the core ruleset', () => {
    expect(win('1133m5577p224466s')).toBe(false);
  });
});

describe('canWin (extra edge cases)', () => {
  it('honors cannot form chows', () => {
    expect(win('123z123m456m789m11p')).toBe(false);
  });
  it('no wrapping 891', () => {
    expect(win('891m123p456p789p11z')).toBe(false);
  });
  it('honor pungs are fine', () => {
    expect(win('111z222z555z777z33z')).toBe(true);
  });
  it('accounts for open melds', () => {
    expect(win('123m11z', 3)).toBe(true); // 3 melds + 1 set + pair = 5 tiles
    expect(win('11z', 4)).toBe(true); // 4 melds + pair
    expect(win('123m456m11z', 3)).toBe(false); // wrong size
  });
  it('wrong tile count is never a win', () => {
    expect(win('123m456m789m11z')).toBe(false);
  });
  it('needs backtracking: 111222333m as three chows or three pungs', () => {
    expect(win('111222333m456p11z')).toBe(true);
    expect(win('112233m456p789s11z')).toBe(true);
  });
  it('does not modify the input counts', () => {
    const c = counts('123m456m789m123p11z');
    const copy = [...c];
    canWin(c, 0);
    waits(c, 0);
    expect(c).toEqual(copy);
  });
});

describe('waits (brief 8.1)', () => {
  it('1112345678999m waits on all of 1m-9m (nine gates)', () => {
    expect(waitsOf('1112345678999m')).toBe('123456789m');
  });
  it('123m456m789m123p1z waits on [1z]', () => {
    expect(waitsOf('123m456m789m123p1z')).toBe('1z');
  });
  it('123m456m789m1123p waits on [1p, 4p], not 2p or 3p', () => {
    expect(waitsOf('123m456m789m1123p')).toBe('14p');
  });
  it('skips kinds where the player already holds all 4', () => {
    // 1111m in hand: can't wait on a 5th 1m.
    expect(waits(counts('1111m234m567p78s99s'), 0)).not.toContain(0);
  });
  it('counts melded copies when skipping kinds', () => {
    // Would wait on 1z, but 1z in hand + 3 in our own pung meld = all 4 copies, so there is no wait.
    const melded = counts('111z');
    expect(waits(counts('123m456m789m1z'), 1, melded)).toEqual([]);
  });
});

describe('performance', () => {
  it('canWin + waits on a full hand take < 1ms on average', () => {
    const hands = ['1112345678999m', '123m456m789m1123p', '1122334455667m', '123m456p789s1155z'];
    const c = hands.map(counts);
    const N = 20000;
    const start = Date.now();
    for (let i = 0; i < N; i++) {
      const h = c[i % c.length];
      waits(h, 0);
    }
    const perCall = (Date.now() - start) / N;
    expect(perCall).toBeLessThan(1);
  });
});
