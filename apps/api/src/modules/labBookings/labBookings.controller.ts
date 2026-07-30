import { Request, Response, NextFunction } from 'express';
import { createBooking, listBookingsForLab, updateBookingStatus, getReportPath } from './labBookings.service';

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
