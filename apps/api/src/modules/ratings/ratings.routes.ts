import { Router } from 'express';
import { CreateRatingInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createRatingHandler, listRatingsForDoctorHandler } from './ratings.controller';

export const ratingsRouter = Router();

ratingsRouter.get('/doctor/:doctorId', listRatingsForDoctorHandler);
ratingsRouter.post('/', requireAuth, requireRole('patient'), validate(CreateRatingInput), createRatingHandler);
