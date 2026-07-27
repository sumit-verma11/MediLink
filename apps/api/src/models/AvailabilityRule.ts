import { Schema, model, Types } from 'mongoose';

export interface IAvailabilityRule {
  _id: Types.ObjectId;
  doctorId: Types.ObjectId;
  dayOfWeek: number; // 0-6
  startTime: string; // "18:00"
  endTime: string;
  slotMinutes: number;
  validFrom: Date;
  validTo: Date;
}

const availabilityRuleSchema = new Schema<IAvailabilityRule>({
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },
  dayOfWeek: { type: Number, min: 0, max: 6, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  slotMinutes: { type: Number, required: true },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, required: true },
});

export const AvailabilityRule = model<IAvailabilityRule>('AvailabilityRule', availabilityRuleSchema);
