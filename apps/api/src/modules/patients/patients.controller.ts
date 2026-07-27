import { Request, Response, NextFunction } from 'express';
import { PatientProfile } from '../../models/PatientProfile';

export async function getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await PatientProfile.findOne({ userId: req.user!.id });
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function upsertMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await PatientProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}
