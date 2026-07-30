import { Router } from 'express';
import { LabProfileInput, LabTestInput, LabTestPatchInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { apiLimiter } from '../../middleware/rateLimit';
import { getMyProfile, upsertMyProfile, addTest, editTest, removeTest, listLabsHandler, getPublicProfile } from './labs.controller';

export const labsRouter = Router();

labsRouter.use(apiLimiter);
labsRouter.get('/', listLabsHandler);
labsRouter.get('/public/:id', getPublicProfile);

labsRouter.use(requireAuth, requireRole('lab'));
labsRouter.get('/me', getMyProfile);
labsRouter.put('/me', validate(LabProfileInput), upsertMyProfile);
labsRouter.post('/me/tests', validate(LabTestInput), addTest);
labsRouter.patch('/me/tests/:code', validate(LabTestPatchInput), editTest);
labsRouter.delete('/me/tests/:code', removeTest);
