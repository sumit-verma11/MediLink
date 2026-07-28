export interface AISpecialtySuggestion {
  name: string;
  confidence: number;
}

export interface AITriageResult {
  emergency: boolean;
  message?: string;
  extractedSymptoms: string[];
  suggestedSpecialties: AISpecialtySuggestion[];
}

export class AIServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const FAILURE_THRESHOLD = 5;
const OPEN_DURATION_MS = 30_000;
const REQUEST_TIMEOUT_MS = 3_000;

let consecutiveFailures = 0;
let circuitOpenedAt: number | null = null;

export function resetCircuitBreaker(): void {
  consecutiveFailures = 0;
  circuitOpenedAt = null;
}

function isCircuitOpen(): boolean {
  if (circuitOpenedAt === null) return false;
  if (Date.now() - circuitOpenedAt > OPEN_DURATION_MS) {
    // Half-open: allow the next call through to test recovery.
    circuitOpenedAt = null;
    consecutiveFailures = 0;
    return false;
  }
  return true;
}

function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= FAILURE_THRESHOLD && circuitOpenedAt === null) {
    circuitOpenedAt = Date.now();
  }
}

function recordSuccess(): void {
  consecutiveFailures = 0;
  circuitOpenedAt = null;
}

export async function callTriageAI(text: string): Promise<AITriageResult> {
  if (isCircuitOpen()) {
    throw new AIServiceUnavailableError('AI service circuit is open');
  }

  const baseUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8001';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      recordFailure();
      throw new AIServiceUnavailableError(`AI service returned ${response.status}`);
    }

    const result = (await response.json()) as AITriageResult;
    recordSuccess();
    return result;
  } catch (err) {
    if (err instanceof AIServiceUnavailableError) throw err;
    recordFailure();
    throw new AIServiceUnavailableError('AI service request failed');
  } finally {
    clearTimeout(timeout);
  }
}
