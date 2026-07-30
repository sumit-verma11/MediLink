import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { listMyNotifications, markReadHandler } from './notifications.controller';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get('/me', listMyNotifications);
notificationsRouter.patch('/:id/read', markReadHandler);
