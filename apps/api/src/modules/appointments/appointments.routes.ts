import { Router } from 'express';
import { CreateAppointmentInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createAppointmentHandler } from './appointments.controller';

export const appointmentsRouter = Router();

appointmentsRouter.use(requireAuth);
appointmentsRouter.post('/', requireRole('patient'), validate(CreateAppointmentInput), createAppointmentHandler);
