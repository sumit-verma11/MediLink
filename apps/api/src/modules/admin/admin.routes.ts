import { Router } from 'express';
import { VerificationDecisionInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { listVerifications, decideVerification } from './admin.controller';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));
adminRouter.get('/verifications', listVerifications);
adminRouter.post('/verifications/:role/:id/decision', validate(VerificationDecisionInput), decideVerification);
