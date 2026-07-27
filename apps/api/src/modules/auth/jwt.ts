import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';

export interface AccessPayload {
  sub: string;
  role: string;
  jti: string;
}

export interface RefreshPayload {
  sub: string;
  jti: string;
}

function accessSecret(): string {
  return process.env.ACCESS_TOKEN_SECRET ?? 'dev-access-secret';
}

function refreshSecret(): string {
  return process.env.REFRESH_TOKEN_SECRET ?? 'dev-refresh-secret';
}

export function signAccessToken(userId: string, role: string): { token: string; jti: string } {
  const jti = nanoid();
  const token = jwt.sign({ sub: userId, role, jti }, accessSecret(), { expiresIn: '15m' });
  return { token, jti };
}

export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = nanoid();
  const token = jwt.sign({ sub: userId, jti }, refreshSecret(), { expiresIn: '7d' });
  return { token, jti };
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, accessSecret()) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, refreshSecret()) as RefreshPayload;
}
