import { Types } from 'mongoose';
import { AuditLog } from '../../models/AuditLog';

export async function logAudit(params: {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await AuditLog.create({
    actorId: new Types.ObjectId(params.actorId),
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: new Types.ObjectId(params.entityId),
    meta: params.meta,
  });
}
