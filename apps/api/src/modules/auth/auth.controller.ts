import { Request, Response, NextFunction } from 'express';
import { register, login, refresh, logout } from './auth.service';
import { AppError } from '../../lib/errors';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // Production runs the frontend and API on different sites (Vercel + Render),
  // and `Lax` cookies are not sent on cross-site requests even with
  // `credentials: 'include'`. `None` requires `secure: true`, which is set above
  // under the same condition.
  sameSite: process.env.NODE_ENV === 'production' ? ('none' as const) : ('lax' as const),
  path: '/',
};

export async function registerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await register(req.body);
    res.status(201).json({ user: { id: user._id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user, accessToken, refreshToken } = await login(req.body);
    res.cookie('accessToken', accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(200).json({ user: { id: user._id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies.refreshToken as string | undefined;
    if (!token) throw new AppError(401, 'No refresh token', 'NO_REFRESH_TOKEN');
    const { accessToken, refreshToken } = await refresh(token);
    res.cookie('accessToken', accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await logout(req.cookies.accessToken, req.cookies.refreshToken);
    res.clearCookie('accessToken', COOKIE_OPTS);
    res.clearCookie('refreshToken', COOKIE_OPTS);
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}
