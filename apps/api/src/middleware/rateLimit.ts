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
  private readonly keyPrefix: string;

  constructor(keyPrefix = 'rl:auth:') {
    this.keyPrefix = keyPrefix;
  }

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
  store: new SimpleRedisStore('rl:auth:'),
});

export const triageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SimpleRedisStore('rl:triage:'),
});

// GET /api/prescriptions/verify/:id is the only unauthenticated route in this
// API. Without a limiter it's an unthrottled enumeration oracle over
// prescription IDs, disclosing doctor name/regNo/clinic/issue-date at
// whatever rate an attacker wants.
export const rxVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SimpleRedisStore('rl:rxverify:'),
});

// GET /api/r/:token is the second unauthenticated route in this API. The token
// is unguessable (nanoid), but without a limiter this is still an unthrottled
// endpoint an attacker could hammer while brute-forcing tokens, so it gets its
// own dedicated limiter -- same shape as rxVerifyLimiter.
export const referralLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SimpleRedisStore('rl:referral:'),
});

// POST /api/telegram/webhook is the third unauthenticated route in this API --
// trust comes from Telegram's own secret-token header, not a session, so it needs
// the same throttling precedent as rxVerifyLimiter/referralLookupLimiter.
export const telegramWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SimpleRedisStore('rl:telegramwebhook:'),
});

// General-purpose limiter for routers that have no more specific one. 100/min is loose
// enough not to interfere with normal dashboard polling (the existing 10s-interval
// fallback refetches on several dashboards) while still bounding abuse.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SimpleRedisStore('rl:api:'),
});
