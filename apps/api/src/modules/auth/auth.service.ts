import bcrypt from 'bcryptjs';
import { RegisterInput, LoginInput } from '@medlink/shared';
import { User } from '../../models/User';
import { AppError } from '../../lib/errors';
import { signAccessToken, signRefreshToken, verifyRefreshToken, verifyAccessToken } from './jwt';
import { getRedis } from '../../lib/redis';
import jwtLib from 'jsonwebtoken';
import { logAudit } from '../audit/audit.service';

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

function refreshKey(userId: string, jti: string): string {
  return `refresh:${userId}:${jti}`;
}

function blacklistKey(jti: string): string {
  return `blacklist:${jti}`;
}

export async function register(input: RegisterInput) {
  const existing = await User.findOne({ email: input.email });
  if (existing) throw new AppError(409, 'Email already registered', 'EMAIL_TAKEN');

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await User.create({
    email: input.email,
    passwordHash,
    name: input.name,
    phone: input.phone,
    role: input.role,
  });

  await logAudit({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: 'user.register',
    entityType: 'User',
    entityId: user._id.toString(),
  });

  return user;
}

export async function login(input: LoginInput) {
  const user = await User.findOne({ email: input.email });
  if (!user) throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');

  const access = signAccessToken(user._id.toString(), user.role);
  const refresh = signRefreshToken(user._id.toString());
  await getRedis().set(refreshKey(user._id.toString(), refresh.jti), '1', 'EX', REFRESH_TTL_SECONDS);

  return { user, accessToken: access.token, refreshToken: refresh.token };
}

export async function refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  let payload: ReturnType<typeof verifyRefreshToken>;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const redis = getRedis();
  const key = refreshKey(payload.sub, payload.jti);
  const exists = await redis.get(key);
  if (!exists) throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  await redis.del(key);

  const user = await User.findById(payload.sub);
  if (!user) throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');

  const access = signAccessToken(user._id.toString(), user.role);
  const newRefresh = signRefreshToken(user._id.toString());
  await redis.set(refreshKey(user._id.toString(), newRefresh.jti), '1', 'EX', REFRESH_TTL_SECONDS);

  return { accessToken: access.token, refreshToken: newRefresh.token };
}

export async function logout(accessToken: string | undefined, refreshToken: string | undefined): Promise<void> {
  const redis = getRedis();

  if (accessToken) {
    try {
      const payload = verifyAccessToken(accessToken);
      const decoded = jwtLib.decode(accessToken) as { exp?: number } | null;
      const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 900;
      if (ttl > 0) await redis.set(blacklistKey(payload.jti), '1', 'EX', ttl);
    } catch {
      // token already invalid/expired — nothing to blacklist
    }
  }

  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await redis.del(refreshKey(payload.sub, payload.jti));
    } catch {
      // already invalid — nothing to revoke
    }
  }
}

export async function isAccessTokenBlacklisted(jti: string): Promise<boolean> {
  const value = await getRedis().get(blacklistKey(jti));
  return value !== null;
}
