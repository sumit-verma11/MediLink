import { Request, Response, NextFunction } from 'express';
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { BlockedDate } from '../../models/BlockedDate';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';

async function requireDoctorProfileId(userId: string): Promise<string> {
  const profile = await DoctorProfile.findOne({ userId });
  if (!profile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');
  return profile._id.toString();
}

export async function listAvailabilityRules(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctorId = await requireDoctorProfileId(req.user!.id);
    const items = await AvailabilityRule.find({ doctorId }).sort({ dayOfWeek: 1 });
    res.status(200).json({ items });
  } catch (err) {
    next(err);
  }
}

export async function createAvailabilityRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctorId = await requireDoctorProfileId(req.user!.id);
    const rule = await AvailabilityRule.create({ ...req.body, doctorId });
    res.status(201).json({ rule });
  } catch (err) {
    next(err);
  }
}

export async function deleteAvailabilityRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctorId = await requireDoctorProfileId(req.user!.id);
    const result = await AvailabilityRule.findOneAndDelete({ _id: req.params.id, doctorId });
    if (!result) throw new AppError(404, 'Rule not found', 'RULE_NOT_FOUND');
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function listBlockedDates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctorId = await requireDoctorProfileId(req.user!.id);
    const items = await BlockedDate.find({ doctorId }).sort({ date: 1 });
    res.status(200).json({ items });
  } catch (err) {
    next(err);
  }
}

export async function createBlockedDate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctorId = await requireDoctorProfileId(req.user!.id);
    const blocked = await BlockedDate.create({ ...req.body, doctorId });
    res.status(201).json({ blocked });
  } catch (err) {
    next(err);
  }
}

export async function deleteBlockedDate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctorId = await requireDoctorProfileId(req.user!.id);
    const result = await BlockedDate.findOneAndDelete({ _id: req.params.id, doctorId });
    if (!result) throw new AppError(404, 'Blocked date not found', 'BLOCKED_DATE_NOT_FOUND');
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}
