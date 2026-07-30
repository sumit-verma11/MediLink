import path from 'node:path';
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import { requireAuth, requireRole } from './middleware/auth';
import { authRouter } from './modules/auth/auth.routes';
import { patientsRouter } from './modules/patients/patients.routes';
import { availabilityRouter, doctorSlotsRouter } from './modules/appointments/availability.routes';
import { appointmentsRouter } from './modules/appointments/appointments.routes';
import { doctorsRouter } from './modules/doctors/doctors.routes';
import { labsRouter } from './modules/labs/labs.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { triageRouter } from './modules/triage/triage.routes';
import { prescriptionsRouter } from './modules/prescriptions/prescriptions.routes';
import { labReferralsRouter, publicReferralRouter } from './modules/labReferrals/labReferrals.routes';
import { labBookingsRouter } from './modules/labBookings/labBookings.routes';

export function createApp(): Express {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Verification docs are medical registration certificates and ID scans. Serving
  // them unauthenticated would expose them to anyone who can guess a file path,
  // so restrict to admins (who review them) and doctors (who own them). This mount
  // is scoped to ONLY the verification-docs subdirectory -- it must never cover the
  // whole `uploads/` tree, since other subdirectories (e.g. `uploads/prescriptions/`)
  // hold PHI that is ownership-scoped to a single patient/doctor pair, which this
  // admin-or-any-doctor check does not enforce. Those files are served exclusively
  // through their own dedicated, ownership-checked routes (see prescriptions.routes.ts).
  app.use(
    '/uploads/verification-docs',
    requireAuth,
    requireRole('admin', 'doctor'),
    express.static(path.join(process.cwd(), 'uploads', 'verification-docs'))
  );

  app.use('/api/auth', authRouter);
  app.use('/api/patients', patientsRouter);
  app.use('/api/doctors/me', availabilityRouter);
  app.use('/api/doctors', doctorSlotsRouter);
  app.use('/api/doctors', doctorsRouter);
  app.use('/api/labs', labsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/appointments', appointmentsRouter);
  app.use('/api/triage', triageRouter);
  app.use('/api/prescriptions', prescriptionsRouter);
  app.use('/api/lab-referrals', labReferralsRouter);
  app.use('/api/r', publicReferralRouter);
  app.use('/api/lab-bookings', labBookingsRouter);

  app.use(errorHandler);
  return app;
}
