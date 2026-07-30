import { z } from 'zod';

export const CreateLabReferralInput = z.object({
  labId: z.string().min(1),
  testCodes: z.array(z.string().min(1)).min(1),
});
export type CreateLabReferralInput = z.infer<typeof CreateLabReferralInput>;

export const CreateLabBookingInput = z.object({
  testCodes: z.array(z.string().min(1)).min(1),
  scheduledAt: z.coerce.date(),
  homeCollection: z.boolean(),
});
export type CreateLabBookingInput = z.infer<typeof CreateLabBookingInput>;

export const UpdateBookingStatusInput = z.object({
  status: z.enum(['sample_collected', 'report_ready']),
});
export type UpdateBookingStatusInput = z.infer<typeof UpdateBookingStatusInput>;
