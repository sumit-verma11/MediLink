import { Request, Response, NextFunction } from 'express';
import { FilterQuery } from 'mongoose';
import { DoctorProfile, IDoctorProfile } from '../../models/DoctorProfile';
import { User } from '../../models/User';
import { AppError } from '../../lib/errors';
import { escapeRegex } from '../../lib/regex';
import { toPositiveInt } from '../../lib/pagination';

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

export async function listDoctorsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(50, toPositiveInt(req.query.limit, 20));

    const filter: FilterQuery<IDoctorProfile> = { verificationStatus: 'approved' };
    if (typeof req.query.specialty === 'string' && req.query.specialty) {
      filter.specialties = { $regex: escapeRegex(req.query.specialty), $options: 'i' };
    }
    if (typeof req.query.city === 'string' && req.query.city) {
      filter.city = { $regex: `^${escapeRegex(req.query.city)}$`, $options: 'i' };
    }
    if (typeof req.query.name === 'string' && req.query.name) {
      const matchingUsers = await User.find({ role: 'doctor', name: { $regex: escapeRegex(req.query.name), $options: 'i' } }, '_id');
      filter.userId = { $in: matchingUsers.map((u) => u._id) };
    }

    // Public, unauthenticated list endpoint -- explicitly project to only the fields a
    // doctor-search result displays. Without this, every field serializes, including
    // verificationDocs (storage paths to medical registration certs/ID scans) and regNo,
    // making them bulk-enumerable by any anonymous caller paging through the list. The
    // single-doctor getPublicProfile endpoint below is a separate, pre-existing surface
    // and intentionally keeps the fuller profile (bio, qualifications, etc.).
    const [items, total] = await Promise.all([
      DoctorProfile.find(filter)
        .select('specialties city consultationFee avgRating ratingCount userId')
        .sort({ avgRating: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'name avatarUrl'),
      DoctorProfile.countDocuments(filter),
    ]);

    res.status(200).json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
}

export async function getPublicProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // The doctor's name lives on the linked User document, not on
    // DoctorProfile itself. Populate it here (rather than making every
    // consumer do a second lookup) so the public profile response is
    // self-contained for frontend display (e.g. the triage recommendation
    // cards, which need the doctor's name alongside specialty/fee/rating).
    const profile = await DoctorProfile.findOne({ _id: req.params.id, verificationStatus: 'approved' }).populate(
      'userId',
      'name avatarUrl'
    );
    if (!profile) throw new AppError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}
