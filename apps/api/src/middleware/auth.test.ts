import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import RedisMock from 'ioredis-mock';
import { setRedisClient, getRedis } from '../lib/redis';
import { signAccessToken } from '../modules/auth/jwt';
import { requireAuth, requireRole } from './auth';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

beforeEach(() => {
  setRedisClient(new RedisMock());
});

function mockReqRes(cookies: Record<string, string>) {
  const req = { cookies } as unknown as Request & { user?: { id: string; role: string } };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  const next = vi.fn();
  return { req, res, next };
}

describe('requireAuth', () => {
  it('attaches req.user for a valid token', async () => {
    const { token } = signAccessToken('user-1', 'patient');
    const { req, res, next } = mockReqRes({ accessToken: token });
    await requireAuth(req, res, next);
    expect(req.user).toEqual({ id: 'user-1', role: 'patient' });
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next with an error when no cookie is present', async () => {
    const { req, res, next } = mockReqRes({});
    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('rejects a token whose jti has been blacklisted', async () => {
    const { token, jti } = signAccessToken('user-1', 'patient');
    // Mirrors what logout does: mark the jti revoked in Redis.
    await getRedis().set(`blacklist:${jti}`, '1');

    const { req, res, next } = mockReqRes({ accessToken: token });
    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'TOKEN_REVOKED' }));
    expect(req.user).toBeUndefined();
  });

  it('rejects a malformed token', async () => {
    const { req, res, next } = mockReqRes({ accessToken: 'not-a-real-jwt' });
    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'INVALID_TOKEN' }));
    expect(req.user).toBeUndefined();
  });
});

describe('requireRole', () => {
  it('allows a matching role through', () => {
    const { req, res, next } = mockReqRes({});
    req.user = { id: 'user-1', role: 'doctor' };
    requireRole('doctor')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a non-matching role with 403', () => {
    const { req, res, next } = mockReqRes({});
    req.user = { id: 'user-1', role: 'patient' };
    requireRole('doctor')(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});
