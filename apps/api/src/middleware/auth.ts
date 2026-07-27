import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../modules/auth/jwt';
import { isAccessTokenBlacklisted } from '../modules/auth/auth.service';
import { AppError } from '../lib/errors';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; role: string };
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.accessToken as string | undefined;
  if (!token) {
    next(new AppError(401, 'Not authenticated', 'NOT_AUTHENTICATED'));
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    if (await isAccessTokenBlacklisted(payload.jti)) {
      next(new AppError(401, 'Token revoked', 'TOKEN_REVOKED'));
      return;
    }
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token', 'INVALID_TOKEN'));
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError(403, 'Forbidden', 'FORBIDDEN'));
      return;
    }
    next();
  };
}
