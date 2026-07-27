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
// Partial: PATCH updates a subset of fields. `.partial()` alone still accepts
// `{}`, which would reach Mongo as an empty `$set` and 500, so require at least
// one field.
const LabTestPatch = LabTestInput.partial().refine((body) => Object.keys(body).length > 0, {
  message: 'At least one field must be provided',
});

labsRouter.patch('/me/tests/:code', validate(LabTestPatch), editTest);
labsRouter.delete('/me/tests/:code', removeTest);
