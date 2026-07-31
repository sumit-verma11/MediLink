import { Router } from 'express';
import { DoctorProfileInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { apiLimiter } from '../../middleware/rateLimit';
import { verificationDocsUpload } from './upload';
import { getMyProfile, upsertMyProfile, uploadVerificationDocs, getPublicProfile, listDoctorsHandler } from './doctors.controller';

export const doctorsRouter = Router();

doctorsRouter.use(apiLimiter);
doctorsRouter.get('/', listDoctorsHandler);
doctorsRouter.get('/public/:id', getPublicProfile);

doctorsRouter.use(requireAuth, requireRole('doctor'));
doctorsRouter.get('/me', getMyProfile);
doctorsRouter.put('/me', validate(DoctorProfileInput), upsertMyProfile);
doctorsRouter.post('/me/verification-docs', verificationDocsUpload.array('docs', 5), uploadVerificationDocs);
