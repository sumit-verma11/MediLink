import { Schema, model, Types } from 'mongoose';

export type UserRole = 'patient' | 'doctor' | 'lab' | 'admin';

export interface IUser {
  _id: Types.ObjectId;
  role: UserRole;
  email: string;
  phone: string;
  passwordHash: string;
  name: string;
  avatarUrl?: string;
  isVerified: boolean;
  createdAt: Date;
}

const userSchema = new Schema<IUser>({
  role: { type: String, enum: ['patient', 'doctor', 'lab', 'admin'], required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  avatarUrl: String,
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export const User = model<IUser>('User', userSchema);
