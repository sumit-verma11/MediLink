import { Router } from 'express';
import { CreateAppointmentInput, RejectAppointmentInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createAppointmentHandler, confirmAppointmentHandler, rejectAppointmentHandler, cancelAppointmentHandler, listMyAppointments } from './appointments.controller';

export const appointmentsRouter = Router();

appointmentsRouter.use(requireAuth);
appointmentsRouter.post('/', requireRole('patient'), validate(CreateAppointmentInput), createAppointmentHandler);
appointmentsRouter.get('/me', requireRole('patient', 'doctor'), listMyAppointments);
appointmentsRouter.patch('/:id/confirm', requireRole('doctor'), confirmAppointmentHandler);
appointmentsRouter.patch('/:id/reject', requireRole('doctor'), validate(RejectAppointmentInput), rejectAppointmentHandler);
appointmentsRouter.patch('/:id/cancel', requireRole('patient'), cancelAppointmentHandler);
