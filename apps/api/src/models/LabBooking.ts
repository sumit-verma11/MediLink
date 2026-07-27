import { Schema, model, Types } from 'mongoose';

export interface ILabBooking {
  _id: Types.ObjectId;
  referralId?: Types.ObjectId;
  patientId: Types.ObjectId;
  labId: Types.ObjectId;
  testCodes: string[];
  totalPrice: number;
  scheduledAt: Date;
  homeCollection: boolean;
  status: string;
  reportUrl?: string;
}

const labBookingSchema = new Schema<ILabBooking>({
  referralId: { type: Schema.Types.ObjectId, ref: 'LabReferral' },
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  labId: { type: Schema.Types.ObjectId, ref: 'LabProfile', required: true },
  testCodes: { type: [String], required: true },
  totalPrice: { type: Number, required: true },
  scheduledAt: { type: Date, required: true },
  homeCollection: { type: Boolean, default: false },
  status: { type: String, default: 'booked' },
  reportUrl: String,
});

export const LabBooking = model<ILabBooking>('LabBooking', labBookingSchema);
