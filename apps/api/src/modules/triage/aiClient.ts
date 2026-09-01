import crypto from 'node:crypto';
import { getRedis } from '../../lib/redis';
import { logger } from '../../lib/logger';

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour, per CLAUDE.md §2

function cacheKey(text: string, language: 'en' | 'hi'): string {
  const normalized = text.trim().toLowerCase();
  const hash = crypto.createHash('sha256').update(`${language}:${normalized}`).digest('hex');
  return `triage:${hash}`;
}

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

export async function callTriageAI(text: string, language: 'en' | 'hi' = 'en'): Promise<AITriageResult> {
  const key = cacheKey(text, language);

  // Cache-read errors must never propagate as a raw exception (bypassing
  // AIServiceUnavailableError) and must never count as an AI-service failure.
  // Treat any Redis GET failure as a cache miss and fall through to the
  // normal circuit-breaker-gated fetch path below.
  let cached: string | null = null;
  try {
    cached = await getRedis().get(key);
  } catch (err) {
    logger.warn(err, 'triage cache read failed; treating as cache miss');
  }

  if (cached) {
    return JSON.parse(cached) as AITriageResult;
  }

  if (isCircuitOpen()) {
    throw new AIServiceUnavailableError('AI service circuit is open');
  }

  const baseUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8001';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let result: AITriageResult;
  try {
    const response = await fetch(`${baseUrl}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }),
      signal: controller.signal,
    });

    if (!response.ok) {
      recordFailure();
      throw new AIServiceUnavailableError(`AI service returned ${response.status}`);
    }

    result = (await response.json()) as AITriageResult;
    recordSuccess();
  } catch (err) {
    if (err instanceof AIServiceUnavailableError) throw err;
    recordFailure();
    throw new AIServiceUnavailableError('AI service request failed');
  } finally {
    clearTimeout(timeout);
  }

  // Cache-write is decoupled from the AI-call try/catch above: a Redis SET
  // failure here must never be mistaken for an AI-service failure (it must
  // not call recordFailure()/trip the circuit breaker) and must never
  // prevent the already-successful `result` from being returned.
  if (!result.emergency) {
    try {
      await getRedis().set(key, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      logger.warn(err, 'triage cache write failed; returning result uncached');
    }
  }

  return result;
}
