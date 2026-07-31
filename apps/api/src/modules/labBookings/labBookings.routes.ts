import { Router } from 'express';
import { CreateLabBookingInput, PatchBookingStatusInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { apiLimiter } from '../../middleware/rateLimit';
import { labReportUpload } from './labBookings.upload';
import {
  createBookingHandler,
  listBookingsForLabHandler,
  listBookingsForPatientHandler,
  updateBookingStatusHandler,
  uploadReportHandler,
  getReportHandler,
  verifyLabOwnsBooking,
} from './labBookings.controller';

export const labBookingsRouter = Router();
labBookingsRouter.use(apiLimiter);
labBookingsRouter.use(requireAuth);
labBookingsRouter.post('/', requireRole('patient'), validate(CreateLabBookingInput), createBookingHandler);
// `/mine` (patient-scoped) and `/me` (lab-scoped) are distinct literal segments,
// so registration order between them doesn't matter for Express route matching;
// both are listed before the `/:id/...` dynamic routes below regardless.
labBookingsRouter.get('/mine', requireRole('patient'), listBookingsForPatientHandler);
labBookingsRouter.get('/me', requireRole('lab'), listBookingsForLabHandler);
labBookingsRouter.patch('/:id/status', requireRole('lab'), validate(PatchBookingStatusInput), updateBookingStatusHandler);
labBookingsRouter.post('/:id/report', requireRole('lab'), verifyLabOwnsBooking, labReportUpload.single('report'), uploadReportHandler);
labBookingsRouter.get('/:id/report', requireRole('patient', 'lab'), getReportHandler);
