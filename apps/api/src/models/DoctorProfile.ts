import { Schema, model, Types } from 'mongoose';

export interface IDoctorProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  specialties: string[];
  qualifications: string[];
  regNo: string;
  experienceYears: number;
  bio: string;
  clinicName: string;
  clinicAddress: string;
  city: string;
  geo: { lat: number; lng: number };
  consultationFee: number;
  languages: string[];
  verificationStatus: 'pending' | 'approved' | 'rejected';
  verificationDocs: string[];
  avgRating: number;
  ratingCount: number;
}

const doctorProfileSchema = new Schema<IDoctorProfile>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  specialties: { type: [String], required: true },
  qualifications: { type: [String], required: true },
  regNo: { type: String, required: true },
  experienceYears: { type: Number, required: true },
  bio: { type: String, required: true },
  clinicName: { type: String, required: true },
  clinicAddress: { type: String, required: true },
  city: { type: String, required: true },
  geo: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  consultationFee: { type: Number, required: true },
  languages: { type: [String], required: true },
  verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  verificationDocs: { type: [String], default: [] },
  avgRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
});

export const DoctorProfile = model<IDoctorProfile>('DoctorProfile', doctorProfileSchema);
