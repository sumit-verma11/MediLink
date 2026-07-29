import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { checkRedFlagLocally, redFlagKeywordsForTesting } from './redFlags';

describe('checkRedFlagLocally', () => {
  it('detects chest pain', () => {
    expect(checkRedFlagLocally('I have crushing chest pain')).not.toBeNull();
  });
  it('detects breathlessness', () => {
    expect(checkRedFlagLocally('severe breathlessness since this morning')).not.toBeNull();
  });
  it('detects suicidal ideation', () => {
    expect(checkRedFlagLocally('I have been having suicidal thoughts')).not.toBeNull();
  });
  it('does not flag ordinary symptoms', () => {
    expect(checkRedFlagLocally('itchy red patches on my elbow for 2 weeks')).toBeNull();
  });
  it('is case-insensitive', () => {
    expect(checkRedFlagLocally('CHEST PAIN and sweating')).not.toBeNull();
  });
});

describe('keyword parity with apps/ai/app/red_flags.py', () => {
  it('matches the Python red-flag keyword list exactly', () => {
    const pythonPath = path.join(__dirname, '../../../../ai/app/red_flags.py');
    const pythonSource = fs.readFileSync(pythonPath, 'utf-8');
    const listMatch = pythonSource.match(/RED_FLAG_KEYWORDS[^=]*=\s*\[([\s\S]*?)\]/);
    const listBody = listMatch?.[1];
    if (!listBody) throw new Error('Could not find RED_FLAG_KEYWORDS in red_flags.py — path or format changed');
    const pythonKeywords = [...listBody.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const tsKeywords = [...redFlagKeywordsForTesting()];
    expect(new Set(tsKeywords)).toEqual(new Set(pythonKeywords));
  });
});
