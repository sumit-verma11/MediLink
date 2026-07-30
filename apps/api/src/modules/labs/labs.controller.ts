import { Request, Response, NextFunction } from 'express';
import { FilterQuery } from 'mongoose';
import { LabProfile, ILabProfile } from '../../models/LabProfile';
import { AppError } from '../../lib/errors';
import { escapeRegex } from '../../lib/regex';
import { toPositiveInt } from '../../lib/pagination';

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

export async function listLabsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(50, toPositiveInt(req.query.limit, 20));

    const filter: FilterQuery<ILabProfile> = { verificationStatus: 'approved' };
    if (typeof req.query.city === 'string' && req.query.city) {
      filter.city = { $regex: `^${escapeRegex(req.query.city)}$`, $options: 'i' };
    }
    if (typeof req.query.testCode === 'string' && req.query.testCode) {
      filter['tests.code'] = req.query.testCode.toUpperCase();
    }
    if (typeof req.query.testName === 'string' && req.query.testName) {
      filter['tests.name'] = { $regex: escapeRegex(req.query.testName), $options: 'i' };
    }

    const [items, total] = await Promise.all([
      LabProfile.find(filter).sort({ _id: -1 }).skip((page - 1) * limit).limit(limit),
      LabProfile.countDocuments(filter),
    ]);

    res.status(200).json({ items, total, page, limit });
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
