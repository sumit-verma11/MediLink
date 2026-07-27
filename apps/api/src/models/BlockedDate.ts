import { Schema, model, Types } from 'mongoose';

export interface IBlockedDate {
  _id: Types.ObjectId;
  doctorId: Types.ObjectId;
  date: Date;
  reason?: string;
}

const blockedDateSchema = new Schema<IBlockedDate>({
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },
  date: { type: Date, required: true },
  reason: String,
});

blockedDateSchema.index({ doctorId: 1, date: 1 }, { unique: true });

export const BlockedDate = model<IBlockedDate>('BlockedDate', blockedDateSchema);
