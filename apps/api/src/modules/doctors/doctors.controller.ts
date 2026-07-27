import { Request, Response, NextFunction } from 'express';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';

export async function getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await DoctorProfile.findOne({ userId: req.user!.id });
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function upsertMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await DoctorProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $set: req.body, $setOnInsert: { verificationStatus: 'pending' } },
      { new: true, upsert: true }
    );
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function uploadVerificationDocs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[]) ?? [];
    const paths = files.map((f) => `/uploads/verification-docs/${f.filename}`);
    const profile = await DoctorProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $push: { verificationDocs: { $each: paths } } },
      { new: true }
    );
    if (!profile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function getPublicProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await DoctorProfile.findOne({ _id: req.params.id, verificationStatus: 'approved' });
    if (!profile) throw new AppError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}
