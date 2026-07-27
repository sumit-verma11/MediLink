import { Schema, model, Types } from 'mongoose';

export interface IAuditLog {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: Types.ObjectId;
  meta?: Record<string, unknown>;
  at: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorRole: { type: String, required: true },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: Schema.Types.ObjectId, required: true },
  meta: { type: Schema.Types.Mixed },
  at: { type: Date, default: Date.now },
});

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
