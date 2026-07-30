import { Request, Response, NextFunction } from 'express';
import { createReferral, getReferralByToken, listReferralsForDoctor, listReferralsForLab } from './labReferrals.service';
import { toPositiveInt } from '../../lib/pagination';

export async function createReferralHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const referral = await createReferral(req.user!.id, req.body.prescriptionId, req.body.labId, req.body.testCodes);
    res.status(201).json({ referral });
  } catch (err) {
    next(err);
  }
}

export async function getReferralByTokenHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await getReferralByToken(req.params.token as string);
    if (!result) {
      res.status(404).json({ error: 'Referral not found' });
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listReferralsForDoctorHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 20);
    const result = await listReferralsForDoctor(req.user!.id, page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listReferralsForLabHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(50, toPositiveInt(req.query.limit, 20));
    const result = await listReferralsForLab(req.user!.id, page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
