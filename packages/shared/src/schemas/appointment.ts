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

export const CreateAppointmentInput = z
  .object({
    doctorId: z.string().min(1),
    slotStart: z.coerce.date(),
    slotEnd: z.coerce.date(),
    symptomSummary: z.string().optional(),
    triageSessionId: z.string().optional(),
  })
  // A booking request is only coherent if it describes a real, still-bookable interval.
  // These two shape checks are cheap and belong in the contract; whether the interval
  // actually matches one of the doctor's generated slots is enforced server-side in
  // createAppointment (it needs database state this schema cannot see).
  .refine((data) => data.slotEnd > data.slotStart, {
    message: 'slotEnd must be after slotStart',
    path: ['slotEnd'],
  })
  .refine((data) => data.slotStart.getTime() > Date.now(), {
    message: 'slotStart must be in the future',
    path: ['slotStart'],
  });
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentInput>;

export const RejectAppointmentInput = z.object({
  reason: z.string().min(1),
});
export type RejectAppointmentInput = z.infer<typeof RejectAppointmentInput>;
