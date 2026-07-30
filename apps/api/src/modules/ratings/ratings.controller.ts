import { Request, Response, NextFunction } from 'express';
import { createRating, listRatingsForDoctor } from './ratings.service';
import { toPositiveInt } from '../../lib/pagination';

export async function createRatingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appointmentId, score, text } = req.body as { appointmentId: string; score: number; text?: string };
    const rating = await createRating(req.user!.id, appointmentId, score, text);
    res.status(201).json({ rating });
  } catch (err) {
    next(err);
  }
}

export async function listRatingsForDoctorHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(50, toPositiveInt(req.query.limit, 20));
    const result = await listRatingsForDoctor(req.params.doctorId!, page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
