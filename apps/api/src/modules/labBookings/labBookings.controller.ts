import { Request, Response, NextFunction } from 'express';
import { createBooking, listBookingsForLab, listBookingsForPatient, updateBookingStatus, getReportPath } from './labBookings.service';
import { LabBooking } from '../../models/LabBooking';
import { LabProfile } from '../../models/LabProfile';
import { AppError } from '../../lib/errors';

// Runs BEFORE multer's upload middleware on POST /:id/report so that ownership is
// proven -- and req.params.id is proven to resolve to a real, owned LabBooking --
// before any file ever touches the filesystem. Without this, multer's filename
// callback (`${req.params.id}.pdf`) would write to disk using an unvalidated route
// param, before updateBookingStatus's own ownership check ever ran downstream: a
// different lab could overwrite another lab's report by POSTing to its booking id,
// and the id could in principle carry path-traversal characters. A malformed id
// (e.g. containing `../`) can never match a real ObjectId, so Mongoose raises a
// CastError, which the global errorHandler already maps to 404 -- closing both the
// ownership bypass and the path-traversal risk in one guard.
export async function verifyLabOwnsBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const lab = await LabProfile.findOne({ userId: req.user!.id });
    if (!lab) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
    const booking = await LabBooking.findOne({ _id: req.params.id, labId: lab._id });
    if (!booking) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
    next();
  } catch (err) {
    next(err);
  }
}

export async function createBookingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const referralToken = typeof req.query.referralToken === 'string' ? req.query.referralToken : undefined;
    const booking = await createBooking(req.user!.id, req.body.labId, req.body, referralToken);
    res.status(201).json({ booking });
  } catch (err) {
    next(err);
  }
}

export async function listBookingsForLabHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 20);
    const result = await listBookingsForLab(req.user!.id, page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listBookingsForPatientHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 20);
    const result = await listBookingsForPatient(req.user!.id, page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateBookingStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const booking = await updateBookingStatus(req.user!.id, req.params.id as string, req.body.status);
    res.status(200).json({ booking });
  } catch (err) {
    next(err);
  }
}

export async function uploadReportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'A PDF file is required' });
      return;
    }
    const reportPath = `/uploads/lab-reports/${req.params.id}.pdf`;
    const booking = await updateBookingStatus(req.user!.id, req.params.id as string, 'report_ready', reportPath);
    res.status(200).json({ booking });
  } catch (err) {
    next(err);
  }
}

export async function getReportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const diskPath = await getReportPath(req.params.id as string, req.user!.id, req.user!.role);
    res.sendFile(diskPath);
  } catch (err) {
    next(err);
  }
}
