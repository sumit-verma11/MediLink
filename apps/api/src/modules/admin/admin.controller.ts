import { Request, Response, NextFunction } from 'express';
import { Model } from 'mongoose';
import { DoctorProfile } from '../../models/DoctorProfile';
import { LabProfile } from '../../models/LabProfile';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';
import { toPositiveInt } from '../../lib/pagination';
import { getAnalytics } from './analytics.service';

// DoctorProfile and LabProfile are both Mongoose models but differ on most fields; a
// union of the two model types breaks overload resolution for find/findByIdAndUpdate.
// Only the fields actually used below (verificationStatus) need to be visible here, so
// narrow to that common shape.
interface VerifiableProfile {
  verificationStatus: 'pending' | 'approved' | 'rejected';
}

function modelForRole(role: string): Model<VerifiableProfile> {
  if (role === 'doctor') return DoctorProfile as unknown as Model<VerifiableProfile>;
  if (role === 'lab') return LabProfile as unknown as Model<VerifiableProfile>;
  throw new AppError(400, 'role must be doctor or lab', 'INVALID_ROLE');
}

export async function listVerifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = String(req.query.role ?? 'doctor');
    const status = String(req.query.status ?? 'pending');
    // Same NaN guard as listMyAppointments: a malformed ?page=abc must be a clean
    // fallback to the default, not a 500 out of Mongoose's .skip().
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(50, toPositiveInt(req.query.limit, 20));
    const Model = modelForRole(role);

    const [items, total] = await Promise.all([
      Model.find({ verificationStatus: status })
        .sort({ _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Model.countDocuments({ verificationStatus: status }),
    ]);

    res.status(200).json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
}

export async function decideVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = req.params.role!;
    const id = req.params.id!;
    const { decision, reason } = req.body as { decision: 'approved' | 'rejected'; reason?: string };
    const Model = modelForRole(role);

    const profile = await Model.findByIdAndUpdate(id, { verificationStatus: decision }, { new: true });
    if (!profile) throw new AppError(404, 'Profile not found', 'PROFILE_NOT_FOUND');

    await logAudit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: `verification.${decision}`,
      entityType: role === 'doctor' ? 'DoctorProfile' : 'LabProfile',
      entityId: id,
      meta: reason ? { reason } : undefined,
    });

    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function getAnalyticsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summary = await getAnalytics();
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
}
