import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { checkRedFlagLocally, redFlagKeywordsForTesting, redFlagKeywordsHiForTesting } from './redFlags';

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

describe('checkRedFlagLocally — Hindi', () => {
  it('detects chest pain (Devanagari)', () => {
    expect(checkRedFlagLocally('सीने में तेज दर्द हो रहा है', 'hi')).not.toBeNull();
  });
  it('detects chest pain (transliterated)', () => {
    expect(checkRedFlagLocally('mujhe seene mein dard ho raha hai', 'hi')).not.toBeNull();
  });
  it('detects breathlessness', () => {
    expect(checkRedFlagLocally('saans lene mein bahut takleef ho rahi hai', 'hi')).not.toBeNull();
  });
  it('detects suicidal ideation', () => {
    expect(checkRedFlagLocally('mujhe khudkushi karne ka man kar raha hai', 'hi')).not.toBeNull();
  });
  it('detects severe bleeding', () => {
    expect(checkRedFlagLocally('bahut khoon beh raha hai aur ruk nahi raha', 'hi')).not.toBeNull();
  });
  it('does not flag ordinary Hindi symptoms', () => {
    expect(checkRedFlagLocally('mere kohni par laal khujli wale daane hain', 'hi')).toBeNull();
  });
  it('does not match Hindi keywords when language is "en"', () => {
    expect(checkRedFlagLocally('seene mein dard', 'en')).toBeNull();
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

  it('matches the Python RED_FLAG_KEYWORDS_HI list exactly', () => {
    const pythonPath = path.join(__dirname, '../../../../ai/app/red_flags.py');
    const pythonSource = fs.readFileSync(pythonPath, 'utf-8');
    const listMatch = pythonSource.match(/RED_FLAG_KEYWORDS_HI[^=]*=\s*\[([\s\S]*?)\]/);
    const listBody = listMatch?.[1];
    if (!listBody) throw new Error('Could not find RED_FLAG_KEYWORDS_HI in red_flags.py — path or format changed');
    const pythonKeywords = [...listBody.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const tsKeywords = [...redFlagKeywordsHiForTesting()];
    expect(new Set(tsKeywords)).toEqual(new Set(pythonKeywords));
  });
});
