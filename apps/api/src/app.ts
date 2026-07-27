import path from 'node:path';
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { patientsRouter } from './modules/patients/patients.routes';
import { doctorsRouter } from './modules/doctors/doctors.routes';
import { labsRouter } from './modules/labs/labs.routes';

export function createApp(): Express {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  app.use('/api/auth', authRouter);
  app.use('/api/patients', patientsRouter);
  app.use('/api/doctors', doctorsRouter);
  app.use('/api/labs', labsRouter);

  app.use(errorHandler);
  return app;
}
