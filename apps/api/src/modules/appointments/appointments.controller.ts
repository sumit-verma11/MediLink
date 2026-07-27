import { Request, Response, NextFunction } from 'express';
import { createAppointment, confirmAppointment, rejectAppointment, cancelAppointment } from './appointments.service';
import { DoctorProfile } from '../../models/DoctorProfile';
import { Appointment } from '../../models/Appointment';
import { toPositiveInt } from '../../lib/pagination';

export async function createAppointmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await createAppointment(req.user!.id, req.body);
    res.status(201).json({ appointment });
  } catch (err) {
    next(err);
  }
}

export async function confirmAppointmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await confirmAppointment(req.params.id!, req.user!.id);
    res.status(200).json({ appointment });
  } catch (err) {
    next(err);
  }
}

export async function rejectAppointmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await rejectAppointment(req.params.id!, req.user!.id, req.body.reason);
    res.status(200).json({ appointment });
  } catch (err) {
    next(err);
  }
}

export async function cancelAppointmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await cancelAppointment(req.params.id!, req.user!.id);
    res.status(200).json({ appointment });
  } catch (err) {
    next(err);
  }
}

export async function listMyAppointments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Number('abc') is NaN, and NaN survives Math.max/min — it would then reach
    // .skip()/.limit() and blow up as a 500. Fall back to the default instead.
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(50, toPositiveInt(req.query.limit, 20));

    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.slotStart = {
        ...(req.query.from ? { $gte: new Date(String(req.query.from)) } : {}),
        ...(req.query.to ? { $lte: new Date(String(req.query.to)) } : {}),
      };
    }

    if (req.user!.role === 'doctor') {
      const doctorProfile = await DoctorProfile.findOne({ userId: req.user!.id });
      filter.doctorId = doctorProfile?._id ?? null;
    } else {
      filter.patientId = req.user!.id;
    }

    const [items, total] = await Promise.all([
      Appointment.find(filter).sort({ slotStart: -1 }).skip((page - 1) * limit).limit(limit),
      Appointment.countDocuments(filter),
    ]);

    res.status(200).json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
}
