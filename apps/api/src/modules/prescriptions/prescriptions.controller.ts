import { Request, Response, NextFunction } from 'express';
import {
  createPrescription,
  amendPrescription,
  listMyPrescriptions,
  getPrescriptionPdfPath,
  getPublicVerification,
  getPrescriptionSuggestions,
} from './prescriptions.service';
import { AppError } from '../../lib/errors';

export async function createPrescriptionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prescription = await createPrescription(req.user!.id, req.body);
    res.status(201).json({ prescription });
  } catch (err) {
    next(err);
  }
}

export async function amendPrescriptionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prescription = await amendPrescription(req.user!.id, req.params.id as string, req.body);
    res.status(201).json({ prescription });
  } catch (err) {
    next(err);
  }
}

export async function listMyPrescriptionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 20);
    const result = await listMyPrescriptions(req.user!.id, page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getPrescriptionPdfHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const diskPath = await getPrescriptionPdfPath(req.params.id as string, req.user!.id, req.user!.role);
    res.sendFile(diskPath);
  } catch (err) {
    next(err);
  }
}

export async function getPrescriptionSuggestionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const suggestions = await getPrescriptionSuggestions(req.user!.id, req.params.appointmentId as string);
    res.status(200).json(suggestions);
  } catch (err) {
    next(err);
  }
}

export async function getPublicVerificationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const verification = await getPublicVerification(req.params.id as string);
    if (!verification) throw new AppError(404, 'Prescription not found', 'PRESCRIPTION_NOT_FOUND');
    res.status(200).json({ verification });
  } catch (err) {
    next(err);
  }
}
