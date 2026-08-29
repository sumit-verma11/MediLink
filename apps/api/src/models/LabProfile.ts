import { Schema, model, Types } from 'mongoose';

export interface ILabTest {
  code: string;
  name: string;
  price: number;
  turnaroundHours: number;
  description?: string;
}

export interface ILabProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  labName: string;
  address: string;
  city: string;
  geo: { lat: number; lng: number };
  timings: string;
  homeCollection: boolean;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  tests: ILabTest[];
  avgRating: number;
  ratingCount: number;
}

const labTestSchema = new Schema<ILabTest>(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    turnaroundHours: { type: Number, required: true },
    description: String,
  },
  { _id: false }
);

const labProfileSchema = new Schema<ILabProfile>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  labName: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  geo: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  timings: { type: String, required: true },
  homeCollection: { type: Boolean, default: false },
  verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  tests: { type: [labTestSchema], default: [] },
  avgRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
});

export const LabProfile = model<ILabProfile>('LabProfile', labProfileSchema);
