import { Request, Response, NextFunction } from 'express';
import { listNotificationsForUser, markNotificationRead } from './notifications.service';
import { toPositiveInt } from '../../lib/pagination';

export async function listMyNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(50, toPositiveInt(req.query.limit, 20));
    const result = await listNotificationsForUser(req.user!.id, page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function markReadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const notification = await markNotificationRead(req.user!.id, req.params.id!);
    res.status(200).json({ notification });
  } catch (err) {
    next(err);
  }
}
