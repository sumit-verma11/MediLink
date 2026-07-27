import RedisMock from 'ioredis-mock';
import { setRedisClient, getRedis } from '../lib/redis';

/**
 * Install a fresh Redis for the test that is about to run.
 *
 * Two things make this necessary. First, the shared `authLimiter` counts requests in
 * Redis with a 20-per-15-minutes budget; a test file that registers/logs in a handful of
 * users per test exhausts that budget partway through and later tests silently get a 429
 * with no cookie. Second, `new RedisMock()` alone is not enough — ioredis-mock instances
 * share one in-memory store by default (it simulates several clients against one server),
 * so the store must also be flushed explicitly.
 *
 * Call from `beforeEach` (not `beforeAll`) in every test file that touches /api/auth/*.
 */
export async function resetTestRedis(): Promise<void> {
  setRedisClient(new RedisMock());
  await getRedis().flushall();
}
