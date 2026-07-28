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
  // so restrict to admins (who review them) and doctors (who own them).
  app.use('/uploads', requireAuth, requireRole('admin', 'doctor'), express.static(path.join(process.cwd(), 'uploads')));

  app.use('/api/auth', authRouter);
  app.use('/api/patients', patientsRouter);
  app.use('/api/doctors/me', availabilityRouter);
  app.use('/api/doctors', doctorSlotsRouter);
  app.use('/api/doctors', doctorsRouter);
  app.use('/api/labs', labsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/appointments', appointmentsRouter);
  app.use('/api/triage', triageRouter);

  app.use(errorHandler);
  return app;
}
