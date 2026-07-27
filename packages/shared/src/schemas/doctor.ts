import { z } from 'zod';

export const GeoInput = z.object({ lat: z.number(), lng: z.number() });

export const DoctorProfileInput = z.object({
  specialties: z.array(z.string().min(1)).min(1),
  qualifications: z.array(z.string().min(1)).min(1),
  regNo: z.string().min(1),
  experienceYears: z.number().int().min(0),
  bio: z.string().min(1),
  clinicName: z.string().min(1),
  clinicAddress: z.string().min(1),
  city: z.string().min(1),
  geo: GeoInput,
  consultationFee: z.number().min(0),
  languages: z.array(z.string().min(1)).min(1),
});
export type DoctorProfileInput = z.infer<typeof DoctorProfileInput>;
