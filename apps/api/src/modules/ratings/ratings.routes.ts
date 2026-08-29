import { Router } from 'express';
import { CreateRatingInput, CreateLabRatingInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { apiLimiter } from '../../middleware/rateLimit';
import {
  createRatingHandler,
  createLabRatingHandler,
  listRatingsForDoctorHandler,
  listRatingsForLabHandler,
} from './ratings.controller';

export const ratingsRouter = Router();

ratingsRouter.use(apiLimiter);
ratingsRouter.get('/doctor/:doctorId', listRatingsForDoctorHandler);
ratingsRouter.get('/lab/:labId', listRatingsForLabHandler);
ratingsRouter.post('/', requireAuth, requireRole('patient'), validate(CreateRatingInput), createRatingHandler);
ratingsRouter.post('/lab', requireAuth, requireRole('patient'), validate(CreateLabRatingInput), createLabRatingHandler);
