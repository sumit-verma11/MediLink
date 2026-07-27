import { Schema, model, Types } from 'mongoose';

export type AppointmentStatus = 'requested' | 'confirmed' | 'rejected' | 'completed' | 'cancelled' | 'no_show';

export interface IAppointment {
  _id: Types.ObjectId;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  slotStart: Date;
  slotEnd: Date;
  status: AppointmentStatus;
  symptomSummary?: string;
  triageSessionId?: Types.ObjectId;
  rejectionReason?: string;
  timeline: { status: AppointmentStatus; at: Date; by: Types.ObjectId }[];
}

const appointmentSchema = new Schema<IAppointment>({
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },
  slotStart: { type: Date, required: true },
  slotEnd: { type: Date, required: true },
  status: {
    type: String,
    enum: ['requested', 'confirmed', 'rejected', 'completed', 'cancelled', 'no_show'],
    default: 'requested',
  },
  symptomSummary: String,
  triageSessionId: { type: Schema.Types.ObjectId, ref: 'TriageSession' },
  rejectionReason: String,
  timeline: {
    type: [
      {
        status: { type: String, required: true },
        at: { type: Date, required: true },
        by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      },
    ],
    default: [],
  },
});

export const Appointment = model<IAppointment>('Appointment', appointmentSchema);
