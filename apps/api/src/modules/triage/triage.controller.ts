import { Request, Response, NextFunction } from 'express';
import { sendTriageMessage } from './triage.service';
import { TriageSession } from '../../models/TriageSession';
import { AppError } from '../../lib/errors';

export async function sendTriageMessageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await sendTriageMessage(req.user!.id, req.body.sessionId, req.body.text);
    res.status(201).json({ session });
  } catch (err) {
    next(err);
  }
}

export async function getTriageSessionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await TriageSession.findOne({ _id: req.params.id, patientId: req.user!.id });
    if (!session) throw new AppError(404, 'Triage session not found', 'TRIAGE_SESSION_NOT_FOUND');
    res.status(200).json({ session });
  } catch (err) {
    next(err);
  }
}
