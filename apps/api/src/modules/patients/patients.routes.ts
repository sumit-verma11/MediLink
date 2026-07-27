import { Router } from 'express';
import { PatientProfileInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getMyProfile, upsertMyProfile } from './patients.controller';

export const patientsRouter = Router();

patientsRouter.use(requireAuth, requireRole('patient'));
patientsRouter.get('/me', getMyProfile);
patientsRouter.put('/me', validate(PatientProfileInput), upsertMyProfile);
