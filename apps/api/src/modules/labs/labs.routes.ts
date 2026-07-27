import { Router } from 'express';
import { LabProfileInput, LabTestInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getMyProfile, upsertMyProfile, addTest, editTest, removeTest, getPublicProfile } from './labs.controller';

export const labsRouter = Router();

labsRouter.get('/public/:id', getPublicProfile);

labsRouter.use(requireAuth, requireRole('lab'));
labsRouter.get('/me', getMyProfile);
labsRouter.put('/me', validate(LabProfileInput), upsertMyProfile);
labsRouter.post('/me/tests', validate(LabTestInput), addTest);
labsRouter.patch('/me/tests/:code', editTest);
labsRouter.delete('/me/tests/:code', removeTest);
