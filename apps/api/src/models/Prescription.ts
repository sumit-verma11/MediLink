import { Schema, model, Types } from 'mongoose';

export interface IMedicine {
  name: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions?: string;
}

export interface IPrescription {
  _id: Types.ObjectId;
  appointmentId: Types.ObjectId;
  doctorId: Types.ObjectId;
  patientId: Types.ObjectId;
  diagnosisNote: string;
  medicines: IMedicine[];
  advice: string;
  followUpDate?: Date;
  recommendedTests: { testName: string; labReferralId?: Types.ObjectId }[];
  pdfUrl?: string;
  createdAt: Date;
  immutable: boolean;
  version: number;
  supersededBy?: Types.ObjectId;
}

const prescriptionSchema = new Schema<IPrescription>({
  appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  diagnosisNote: { type: String, required: true },
  medicines: {
    type: [
      {
        name: { type: String, required: true },
        dosage: { type: String, required: true },
        frequency: { type: String, required: true },
        durationDays: { type: Number, required: true },
        instructions: String,
      },
    ],
    required: true,
  },
  advice: { type: String, required: true },
  followUpDate: Date,
  recommendedTests: {
    type: [{ testName: { type: String, required: true }, labReferralId: { type: Schema.Types.ObjectId, ref: 'LabReferral' } }],
    default: [],
  },
  pdfUrl: String,
  createdAt: { type: Date, default: Date.now },
  immutable: { type: Boolean, default: true },
  version: { type: Number, default: 1 },
  supersededBy: { type: Schema.Types.ObjectId, ref: 'Prescription' },
});

export const Prescription = model<IPrescription>('Prescription', prescriptionSchema);
