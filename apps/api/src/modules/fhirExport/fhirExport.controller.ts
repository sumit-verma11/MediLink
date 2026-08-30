import { Request, Response, NextFunction } from 'express';
import { canExportPatient, buildFhirBundle } from './fhirExport.service';
import { logAudit } from '../audit/audit.service';
import { AppError } from '../../lib/errors';

export async function getFhirExportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { patientId } = req.params as { patientId: string };
    const { encounterId } = req.query as { encounterId?: string };

    const authorized = await canExportPatient({ id: req.user!.id, role: req.user!.role }, patientId);
    if (!authorized) throw new AppError(403, "Not authorized to export this patient's data", 'FORBIDDEN');

    const bundle = await buildFhirBundle(patientId, { encounterId });

    const counts = bundle.entry.reduce<Record<string, number>>((acc, e) => {
      acc[e.resource.resourceType] = (acc[e.resource.resourceType] ?? 0) + 1;
      return acc;
    }, {});
    await logAudit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'fhir_export',
      entityType: 'Patient',
      entityId: patientId,
      meta: { encounterId, resourceCounts: counts },
    });

    res.status(200).json(bundle);
  } catch (err) {
    next(err);
  }
}
