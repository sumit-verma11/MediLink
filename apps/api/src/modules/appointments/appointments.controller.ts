import { Request, Response, NextFunction } from 'express';
import { createAppointment } from './appointments.service';

export async function createAppointmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await createAppointment(req.user!.id, req.body);
    res.status(201).json({ appointment });
  } catch (err) {
    next(err);
  }
}
