import { Schema, model, Types } from 'mongoose';

// A rating is either a doctor rating (doctorId + appointmentId) or a lab rating
// (labId + bookingId) -- never both, never neither. That XOR isn't expressible as
// Mongoose `required`, so it's enforced in ratings.service.ts, which is also the
// only place that ever constructs a Rating.
export interface IRating {
  _id: Types.ObjectId;
  doctorId?: Types.ObjectId;
  labId?: Types.ObjectId;
  patientId: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  bookingId?: Types.ObjectId;
  score: number;
  text?: string;
  createdAt: Date;
}

const ratingSchema = new Schema<IRating>({
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile' },
  labId: { type: Schema.Types.ObjectId, ref: 'LabProfile' },
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // Unique + sparse: one appointment (or one booking) can only ever be rated once, but
  // sparse so a lab rating (which has no appointmentId) doesn't collide with every other
  // lab rating under a shared `null` value, and vice versa for bookingId on doctor
  // ratings. This is the race-safety guard -- createRating/createLabRating rely on
  // catching the resulting E11000 duplicate-key error rather than a check-then-create race.
  appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', unique: true, sparse: true },
  bookingId: { type: Schema.Types.ObjectId, ref: 'LabBooking', unique: true, sparse: true },
  score: { type: Number, required: true, min: 1, max: 5 },
  text: { type: String, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
});

export const Rating = model<IRating>('Rating', ratingSchema);
