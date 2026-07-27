import Redis from 'ioredis';

let client: Redis | undefined;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }
  return client;
}

export function setRedisClient(custom: Redis): void {
  client = custom;
}
