import { z } from 'zod';

export const AvailabilityRuleInput = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotMinutes: z.number().int().min(5).max(120),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
});
export type AvailabilityRuleInput = z.infer<typeof AvailabilityRuleInput>;

export const BlockedDateInput = z.object({
  date: z.coerce.date(),
  reason: z.string().optional(),
});
export type BlockedDateInput = z.infer<typeof BlockedDateInput>;

export const CreateAppointmentInput = z.object({
  doctorId: z.string().min(1),
  slotStart: z.coerce.date(),
  slotEnd: z.coerce.date(),
  symptomSummary: z.string().optional(),
  triageSessionId: z.string().optional(),
});
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentInput>;

export const RejectAppointmentInput = z.object({
  reason: z.string().min(1),
});
export type RejectAppointmentInput = z.infer<typeof RejectAppointmentInput>;
