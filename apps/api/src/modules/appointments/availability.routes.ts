import { Router } from 'express';
import { AvailabilityRuleInput, BlockedDateInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  listAvailabilityRules, createAvailabilityRule, deleteAvailabilityRule,
  listBlockedDates, createBlockedDate, deleteBlockedDate,
  getDoctorSlots,
} from './availability.controller';

export const availabilityRouter = Router();

availabilityRouter.use(requireAuth, requireRole('doctor'));
availabilityRouter.get('/availability-rules', listAvailabilityRules);
availabilityRouter.post('/availability-rules', validate(AvailabilityRuleInput), createAvailabilityRule);
availabilityRouter.delete('/availability-rules/:id', deleteAvailabilityRule);
availabilityRouter.get('/blocked-dates', listBlockedDates);
availabilityRouter.post('/blocked-dates', validate(BlockedDateInput), createBlockedDate);
availabilityRouter.delete('/blocked-dates/:id', deleteBlockedDate);

export const doctorSlotsRouter = Router();
doctorSlotsRouter.get('/:id/slots', requireAuth, getDoctorSlots);
