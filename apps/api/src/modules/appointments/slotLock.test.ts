import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import { getRedis, setRedisClient } from '../../lib/redis';
import { acquireSlotLock, releaseSlotLock } from './slotLock';

beforeEach(async () => {
  // ioredis-mock shares its in-memory store across all `new RedisMock()`
  // instances by default (it simulates multiple clients on one Redis
  // server), so a fresh instance alone does not reset state between
  // tests. Flush explicitly to guarantee isolation.
  setRedisClient(new RedisMock());
  await getRedis().flushall();
});

describe('acquireSlotLock', () => {
  it('acquires a free lock', async () => {
    const acquired = await acquireSlotLock('doc1', '2026-08-05T18:00:00.000Z', 'patient1');
    expect(acquired).toBe(true);
  });

  it('rejects acquiring an already-held lock', async () => {
    await acquireSlotLock('doc1', '2026-08-05T18:00:00.000Z', 'patient1');
    const secondAttempt = await acquireSlotLock('doc1', '2026-08-05T18:00:00.000Z', 'patient2');
    expect(secondAttempt).toBe(false);
  });

  it('allows acquiring again after release', async () => {
    await acquireSlotLock('doc1', '2026-08-05T18:00:00.000Z', 'patient1');
    await releaseSlotLock('doc1', '2026-08-05T18:00:00.000Z');
    const secondAttempt = await acquireSlotLock('doc1', '2026-08-05T18:00:00.000Z', 'patient2');
    expect(secondAttempt).toBe(true);
  });

  it('locks are independent per doctor+slot combination', async () => {
    const a = await acquireSlotLock('doc1', '2026-08-05T18:00:00.000Z', 'patient1');
    const b = await acquireSlotLock('doc2', '2026-08-05T18:00:00.000Z', 'patient1');
    const c = await acquireSlotLock('doc1', '2026-08-05T19:00:00.000Z', 'patient1');
    expect(a && b && c).toBe(true);
  });
});
