import { Router } from 'express';
import { CreateLabBookingInput, UpdateBookingStatusInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { labReportUpload } from './labBookings.upload';
import {
  createBookingHandler,
  listBookingsForLabHandler,
  updateBookingStatusHandler,
  uploadReportHandler,
  getReportHandler,
} from './labBookings.controller';

export const labBookingsRouter = Router();
labBookingsRouter.use(requireAuth);
labBookingsRouter.post('/', requireRole('patient'), validate(CreateLabBookingInput), createBookingHandler);
labBookingsRouter.get('/me', requireRole('lab'), listBookingsForLabHandler);
labBookingsRouter.patch('/:id/status', requireRole('lab'), validate(UpdateBookingStatusInput), updateBookingStatusHandler);
labBookingsRouter.post('/:id/report', requireRole('lab'), labReportUpload.single('report'), uploadReportHandler);
labBookingsRouter.get('/:id/report', requireRole('patient', 'lab'), getReportHandler);
