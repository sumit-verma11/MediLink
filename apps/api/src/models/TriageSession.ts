import { Schema, model, Types } from 'mongoose';

export interface ITriageSession {
  _id: Types.ObjectId;
  patientId: Types.ObjectId;
  messages: { role: 'user' | 'assistant'; text: string; at: Date }[];
  extractedSymptoms: string[];
  suggestedSpecialties: { name: string; confidence: number }[];
  recommendedDoctorIds: Types.ObjectId[];
  disclaimerShownAt?: Date;
  isRedFlag: boolean;
}

const triageSessionSchema = new Schema<ITriageSession>({
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  messages: {
    type: [
      {
        role: { type: String, enum: ['user', 'assistant'], required: true },
        text: { type: String, required: true },
        at: { type: Date, required: true },
      },
    ],
    default: [],
  },
  extractedSymptoms: { type: [String], default: [] },
  suggestedSpecialties: {
    type: [{ name: { type: String, required: true }, confidence: { type: Number, required: true } }],
    default: [],
  },
  recommendedDoctorIds: { type: [Schema.Types.ObjectId], ref: 'DoctorProfile', default: [] },
  disclaimerShownAt: Date,
  isRedFlag: { type: Boolean, default: false },
});

export const TriageSession = model<ITriageSession>('TriageSession', triageSessionSchema);
