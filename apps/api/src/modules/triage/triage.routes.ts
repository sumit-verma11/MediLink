import { Router } from 'express';
import { SendTriageMessageInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { sendTriageMessageHandler, getTriageSessionHandler } from './triage.controller';

export const triageRouter = Router();

triageRouter.use(requireAuth);
triageRouter.post('/messages', requireRole('patient'), validate(SendTriageMessageInput), sendTriageMessageHandler);
triageRouter.get('/:id', requireRole('patient'), getTriageSessionHandler);
