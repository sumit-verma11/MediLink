import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { apiLimiter } from '../../middleware/rateLimit';
import { listMyNotifications, markReadHandler } from './notifications.controller';

export const notificationsRouter = Router();

notificationsRouter.use(apiLimiter);
notificationsRouter.use(requireAuth);
notificationsRouter.get('/me', listMyNotifications);
notificationsRouter.patch('/:id/read', markReadHandler);
