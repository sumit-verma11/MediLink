import { z } from 'zod';

export const PatientProfileInput = z.object({
  age: z.number().int().min(0).max(120).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  city: z.string().min(1).optional(),
});
export type PatientProfileInput = z.infer<typeof PatientProfileInput>;
