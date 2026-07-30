import { describe, it, expect } from 'vitest';
import { escapeRegex } from './regex';

describe('escapeRegex', () => {
  it('escapes regex metacharacters so they are matched literally', () => {
    expect(escapeRegex('a.b')).toBe('a\\.b');
    expect(escapeRegex('C++')).toBe('C\\+\\+');
    expect(escapeRegex('(test)')).toBe('\\(test\\)');
  });

  it('leaves plain alphanumeric input unchanged', () => {
    expect(escapeRegex('Dermatology')).toBe('Dermatology');
  });
});
