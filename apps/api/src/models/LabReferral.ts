import { Schema, model, Types } from 'mongoose';

export type LabReferralStatus = 'sent' | 'opened' | 'booked' | 'sample_collected' | 'report_ready' | 'closed';

export interface ILabReferral {
  _id: Types.ObjectId;
  prescriptionId: Types.ObjectId;
  doctorId: Types.ObjectId;
  patientId: Types.ObjectId;
  labId: Types.ObjectId;
  suggestedTestCodes: string[];
  token: string;
  status: LabReferralStatus;
  reportUrl?: string;
  timeline: { status: LabReferralStatus; at: Date }[];
  expiresAt: Date;
}

const labReferralSchema = new Schema<ILabReferral>({
  prescriptionId: { type: Schema.Types.ObjectId, ref: 'Prescription', required: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  labId: { type: Schema.Types.ObjectId, ref: 'LabProfile', required: true },
  suggestedTestCodes: { type: [String], required: true },
  token: { type: String, required: true, unique: true },
  status: {
    type: String,
    enum: ['sent', 'opened', 'booked', 'sample_collected', 'report_ready', 'closed'],
    default: 'sent',
  },
  reportUrl: String,
  timeline: {
    type: [{ status: { type: String, required: true }, at: { type: Date, required: true } }],
    default: [],
  },
  // CLAUDE.md §1: the referral's direct link "expires in 30 days" -- set by
  // createReferral at creation time, enforced (existence-blind) by
  // getReferralByToken.
  expiresAt: { type: Date, required: true },
});

export const LabReferral = model<ILabReferral>('LabReferral', labReferralSchema);
