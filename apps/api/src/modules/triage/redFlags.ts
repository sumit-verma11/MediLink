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

export function checkRedFlagLocally(text: string): string | null {
  const normalized = text.toLowerCase();
  for (const keyword of RED_FLAG_KEYWORDS) {
    if (normalized.includes(keyword)) return keyword;
  }
  return null;
}

export function redFlagKeywordsForTesting(): readonly string[] {
  return RED_FLAG_KEYWORDS;
}
