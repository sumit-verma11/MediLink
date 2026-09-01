const RED_FLAG_KEYWORDS: readonly string[] = [
  'chest pain',
  'crushing chest',
  'breathless',
  'difficulty breathing',
  'shortness of breath',
  'suicidal',
  'self harm',
  'severe bleeding',
  "bleeding that won't stop",
  'sudden vision loss',
  'loss of vision',
  'unconscious',
  'unresponsive',
  'seizure',
  'stroke',
  'slurred speech',
  'face drooping',
  'severe abdominal pain',
];

// Devanagari + common Latin-transliterated variants, one or more per English
// concept above. AUTHOR/REVIEW NOTE: these must be reviewed by a fluent Hindi
// speaker (or clinically-informed reviewer) before this is trusted in any real
// deployment -- see the design spec's "highest-stakes part of this feature"
// note. KEEP THIS LIST IDENTICAL to apps/ai/app/red_flags.py's
// RED_FLAG_KEYWORDS_HI -- enforced mechanically by the parity test below, not
// just this comment.
const RED_FLAG_KEYWORDS_HI: readonly string[] = [
  'सीने में दर्द', 'सीने में तेज दर्द', 'seene mein dard', 'seene mein tez dard', 'chest mein dard',
  'सांस लेने में तकलीफ', 'saans lene mein takleef', 'saans lene mein bahut takleef', 'saans phoolna',
  'आत्महत्या', 'khudkushi', 'aatmahatya', 'khud ko nuksan',
  'बहुत खून बह रहा', 'bahut khoon beh raha hai', 'khoon nahi ruk raha',
  'अचानक दिखना बंद', 'achanak dikhna band ho gaya', 'achanak roshni chali gayi',
  'बेहोश', 'behosh', 'behoshi',
  'दौरा पड़ना', 'daura padna', 'mirgi ka daura',
  'लकवा', 'lakwa', 'chehra tedha ho gaya', 'बोलने में लड़खड़ाहट',
  'पेट में तेज दर्द', 'pet mein bahut tez dard',
];

export function checkRedFlagLocally(text: string, language: 'en' | 'hi' = 'en'): string | null {
  const keywords = language === 'hi' ? RED_FLAG_KEYWORDS_HI : RED_FLAG_KEYWORDS;
  const normalized = text.toLowerCase();
  for (const keyword of keywords) {
    if (normalized.includes(keyword.toLowerCase())) return keyword;
  }
  return null;
}

export function redFlagKeywordsForTesting(): readonly string[] {
  return RED_FLAG_KEYWORDS;
}

export function redFlagKeywordsHiForTesting(): readonly string[] {
  return RED_FLAG_KEYWORDS_HI;
}
