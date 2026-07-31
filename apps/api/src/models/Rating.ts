import { Schema, model, Types } from 'mongoose';

export interface IRating {
  _id: Types.ObjectId;
  doctorId: Types.ObjectId;
  patientId: Types.ObjectId;
  appointmentId: Types.ObjectId;
  score: number;
  text?: string;
  createdAt: Date;
}

const ratingSchema = new Schema<IRating>({
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // Unique, not just indexed: one appointment can only ever be rated once. This is the
  // race-safety guard -- createRating (Task 2) relies on catching the resulting E11000
  // duplicate-key error rather than a check-then-create race.
  appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true },
  score: { type: Number, required: true, min: 1, max: 5 },
  text: { type: String, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
});

export const Rating = model<IRating>('Rating', ratingSchema);
