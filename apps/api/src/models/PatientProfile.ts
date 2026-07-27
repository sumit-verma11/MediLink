import { Schema, model, Types } from 'mongoose';

export interface IPatientProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  city?: string;
}

const patientProfileSchema = new Schema<IPatientProfile>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  age: Number,
  gender: { type: String, enum: ['male', 'female', 'other'] },
  city: String,
});

export const PatientProfile = model<IPatientProfile>('PatientProfile', patientProfileSchema);
