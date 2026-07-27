import { z } from 'zod';
import { GeoInput } from './doctor';

export const LabProfileInput = z.object({
  labName: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  geo: GeoInput,
  timings: z.string().min(1),
  homeCollection: z.boolean(),
});
export type LabProfileInput = z.infer<typeof LabProfileInput>;

export const LabTestInput = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  price: z.number().min(0),
  turnaroundHours: z.number().int().min(1),
  description: z.string().optional(),
});
export type LabTestInput = z.infer<typeof LabTestInput>;

export const LabTestPatchInput = LabTestInput.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);
export type LabTestPatchInput = z.infer<typeof LabTestPatchInput>;
