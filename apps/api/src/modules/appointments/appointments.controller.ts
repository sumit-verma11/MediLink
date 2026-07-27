import { Request, Response, NextFunction } from 'express';
import { createAppointment, confirmAppointment, rejectAppointment, cancelAppointment } from './appointments.service';

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
