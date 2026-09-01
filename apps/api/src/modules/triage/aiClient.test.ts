import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import { callTriageAI, AIServiceUnavailableError, resetCircuitBreaker } from './aiClient';
import { setRedisClient, getRedis } from '../../lib/redis';
import { resetTestRedis } from '../../test-utils/resetRateLimit';

const originalFetch = global.fetch;

beforeEach(async () => {
  // callTriageAI now checks Redis before every call (Task 9), so every test in
  // this file needs a fresh mock Redis wired in — not just the caching-specific
  // describe block below — otherwise these calls fall through to `getRedis()`'s
  // default real ioredis client and hang trying to reach localhost:6379.
  await resetTestRedis();
  resetCircuitBreaker();
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe('callTriageAI', () => {
  it('returns the parsed AI response on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ emergency: false, extractedSymptoms: ['itchy patches'], suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.87 }] }),
    }) as unknown as typeof fetch;

    const result = await callTriageAI('itchy patches');
    expect(result.emergency).toBe(false);
    expect(result.suggestedSpecialties[0]?.name).toBe('Dermatology');
  });

  it('throws AIServiceUnavailableError on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(callTriageAI('test')).rejects.toBeInstanceOf(AIServiceUnavailableError);
  });

  it('throws AIServiceUnavailableError when fetch itself rejects (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(callTriageAI('test')).rejects.toBeInstanceOf(AIServiceUnavailableError);
  });

  it('opens the circuit after repeated failures and fails fast without calling fetch', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;
    for (let i = 0; i < 5; i++) {
      await expect(callTriageAI('test')).rejects.toBeInstanceOf(AIServiceUnavailableError);
    }
    const callCountBeforeOpen = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    await expect(callTriageAI('test')).rejects.toBeInstanceOf(AIServiceUnavailableError);
    const callCountAfterOneMore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // The circuit should now be open: one more failing attempt should NOT have
    // triggered another real fetch call.
    expect(callCountAfterOneMore).toBe(callCountBeforeOpen);
  });
});

describe('callTriageAI Redis caching', () => {
  beforeEach(async () => {
    setRedisClient(new RedisMock());
    await getRedis().flushall();
    resetCircuitBreaker();
  });

  it('caches a successful AI response and does not re-call fetch for the same normalized text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ emergency: false, extractedSymptoms: [], suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.9 }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await callTriageAI('Itchy Red Patches');
    await callTriageAI('itchy red patches'); // same text, different case/whitespace normalization

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not share a cache entry between an English and a Hindi call for the same normalized text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ emergency: false, extractedSymptoms: [], suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.9 }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await callTriageAI('seene mein dard', 'en');
    await callTriageAI('seene mein dard', 'hi');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache an emergency response (never skip red-flag re-evaluation on a cache hit)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ emergency: true, message: 'Seek care', extractedSymptoms: [], suggestedSpecialties: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await callTriageAI('chest pain');
    await callTriageAI('chest pain');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a Redis GET failure as a cache miss and still returns a valid result from fetch (no raw error propagation)', async () => {
    vi.spyOn(getRedis(), 'get').mockRejectedValueOnce(new Error('ECONNRESET'));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ emergency: false, extractedSymptoms: [], suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.9 }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await callTriageAI('a cache-read-failure case');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.emergency).toBe(false);
    expect(result.suggestedSpecialties[0]?.name).toBe('Dermatology');
  });

  it('does not let a Redis SET failure after a successful fetch discard the result or count as a circuit-breaker failure', async () => {
    vi.spyOn(getRedis(), 'set').mockRejectedValueOnce(new Error('WRITE ECONNRESET'));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ emergency: false, extractedSymptoms: [], suggestedSpecialties: [{ name: 'Cardiology', confidence: 0.8 }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await callTriageAI('a cache-write-failure case');

    expect(result.emergency).toBe(false);
    expect(result.suggestedSpecialties[0]?.name).toBe('Cardiology');

    // Prove the circuit breaker's failure count was NOT incremented by the
    // cache-write error: a subsequent call for different text must still go
    // through the normal fetch path (not fail-fast, which would happen if
    // the circuit had tripped open from spurious cache-write "failures").
    const fetchMock2 = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ emergency: false, extractedSymptoms: [], suggestedSpecialties: [{ name: 'Neurology', confidence: 0.7 }] }),
    });
    global.fetch = fetchMock2 as unknown as typeof fetch;

    const result2 = await callTriageAI('a different case entirely');
    expect(fetchMock2).toHaveBeenCalledTimes(1);
    expect(result2.suggestedSpecialties[0]?.name).toBe('Neurology');
  });
});
