import { describe, it, expect } from 'vitest';
import { buildWall, createRng, rollDice } from '../src/wall';

describe('wall + seeded RNG', () => {
  it('contains every tile id exactly once', () => {
    const wall = buildWall(createRng(42));
    expect(wall).toHaveLength(136);
    expect(new Set(wall).size).toBe(136);
  });
  it('is reproducible from a seed', () => {
    expect(buildWall(createRng(7))).toEqual(buildWall(createRng(7)));
    expect(buildWall(createRng(7))).not.toEqual(buildWall(createRng(8)));
  });
  it('can resume from a stored state', () => {
    const a = createRng(123);
    a.next();
    const resumed = createRng(a.state);
    expect(resumed.next()).toBe(a.next());
  });
  it('dice are 1-6', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) for (const d of rollDice(rng)) expect(d >= 1 && d <= 6).toBe(true);
  });
});
