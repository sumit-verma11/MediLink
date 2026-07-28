import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callTriageAI, AIServiceUnavailableError, resetCircuitBreaker } from './aiClient';

const originalFetch = global.fetch;

beforeEach(() => {
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
