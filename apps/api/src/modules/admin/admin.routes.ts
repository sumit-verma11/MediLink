import { Router } from 'express';
import { VerificationDecisionInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { apiLimiter } from '../../middleware/rateLimit';
import { listVerifications, decideVerification, getAnalyticsHandler } from './admin.controller';

export const adminRouter = Router();

adminRouter.use(apiLimiter);
adminRouter.use(requireAuth, requireRole('admin'));
adminRouter.get('/verifications', listVerifications);
adminRouter.post('/verifications/:role/:id/decision', validate(VerificationDecisionInput), decideVerification);
adminRouter.get('/analytics', getAnalyticsHandler);
