import rateLimit, { Store, IncrementResponse, Options } from 'express-rate-limit';
import { getRedis } from '../lib/redis';

// `rate-limit-redis`'s `RedisStore` implements atomic increment via Lua
// (`SCRIPT LOAD` + `EVALSHA`). That's fine against a real Redis server, but
// `ioredis-mock` (used in tests via `setRedisClient`) does not implement the
// `SCRIPT` command at all, so that store can never work under test. This
// store gets the same Redis-backed behavior using only plain commands
// (`INCR` / `PEXPIRE` / `PTTL` / `DECR` / `DEL`) that both real `ioredis`
// and `ioredis-mock` support.
class SimpleRedisStore implements Store {
  private windowMs = 15 * 60 * 1000;
  private readonly keyPrefix = 'rl:auth:';

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private key(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redis = getRedis();
    const redisKey = this.key(key);
    const totalHits = await redis.incr(redisKey);
    if (totalHits === 1) {
      await redis.pexpire(redisKey, this.windowMs);
    }
    const ttl = await redis.pttl(redisKey);
    const resetTime = new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs));
    return { totalHits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    await getRedis().decr(this.key(key));
  }

  async resetKey(key: string): Promise<void> {
    await getRedis().del(this.key(key));
  }
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SimpleRedisStore(),
});
