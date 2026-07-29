import { Router } from 'express';
import { SendTriageMessageInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { triageLimiter } from '../../middleware/rateLimit';
import { sendTriageMessageHandler, getTriageSessionHandler } from './triage.controller';

export const triageRouter = Router();

triageRouter.use(requireAuth);
triageRouter.use(triageLimiter);
triageRouter.post('/messages', requireRole('patient'), validate(SendTriageMessageInput), sendTriageMessageHandler);
triageRouter.get('/:id', requireRole('patient'), getTriageSessionHandler);
