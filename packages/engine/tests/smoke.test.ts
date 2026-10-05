import { describe, it, expect } from 'vitest';
import { RULES } from '../src';

describe('scaffold', () => {
  it('exports RULES', () => {
    expect(RULES.winOnDiscard).toBe(true);
  });
});
