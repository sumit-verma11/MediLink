import { z } from 'zod';

const MedicineInput = z.object({
  name: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  durationDays: z.coerce.number().int().positive(),
  instructions: z.string().optional(),
});

const RecommendedTestInput = z.object({
  testName: z.string().min(1),
});

export const CreatePrescriptionInput = z.object({
  appointmentId: z.string().min(1),
  diagnosisNote: z.string().min(1),
  medicines: z.array(MedicineInput).min(1),
  advice: z.string().min(1),
  followUpDate: z.coerce.date().optional(),
  recommendedTests: z.array(RecommendedTestInput).optional(),
});
export type CreatePrescriptionInput = z.infer<typeof CreatePrescriptionInput>;

export const AmendPrescriptionInput = CreatePrescriptionInput.omit({ appointmentId: true });
export type AmendPrescriptionInput = z.infer<typeof AmendPrescriptionInput>;
