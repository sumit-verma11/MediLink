import { Request, Response, NextFunction } from 'express';
import { LabProfile } from '../../models/LabProfile';
import { AppError } from '../../lib/errors';

export async function getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await LabProfile.findOne({ userId: req.user!.id });
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function upsertMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await LabProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $set: req.body, $setOnInsert: { verificationStatus: 'pending' } },
      { new: true, upsert: true }
    );
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function addTest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await LabProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $push: { tests: req.body } },
      { new: true }
    );
    if (!profile) throw new AppError(404, 'Lab profile not found', 'PROFILE_NOT_FOUND');
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function editTest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const setFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(req.body)) {
      setFields[`tests.$.${key}`] = value;
    }
    const profile = await LabProfile.findOneAndUpdate(
      { userId: req.user!.id, 'tests.code': req.params.code },
      { $set: setFields },
      { new: true }
    );
    if (!profile) throw new AppError(404, 'Test not found', 'TEST_NOT_FOUND');
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function removeTest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await LabProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $pull: { tests: { code: req.params.code } } },
      { new: true }
    );
    if (!profile) throw new AppError(404, 'Lab profile not found', 'PROFILE_NOT_FOUND');
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function getPublicProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await LabProfile.findOne({ _id: req.params.id, verificationStatus: 'approved' });
    if (!profile) throw new AppError(404, 'Lab not found', 'LAB_NOT_FOUND');
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}
