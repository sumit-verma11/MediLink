import { z } from 'zod';

export const CreateLabReferralInput = z.object({
  prescriptionId: z.string().min(1),
  labId: z.string().min(1),
  testCodes: z.array(z.string().min(1)).min(1),
});
export type CreateLabReferralInput = z.infer<typeof CreateLabReferralInput>;

export const CreateLabBookingInput = z.object({
  labId: z.string().min(1),
  testCodes: z.array(z.string().min(1)).min(1),
  scheduledAt: z.coerce.date(),
  homeCollection: z.boolean(),
});
export type CreateLabBookingInput = z.infer<typeof CreateLabBookingInput>;

// The broader shape (both pipeline statuses a lab can ever set on a booking).
// Kept as an internal service-layer type -- report_ready is only ever reached
// via the report-upload handler, which hardcodes that status itself rather
// than taking it from user input, so this is never used to validate a
// request body.
export const UpdateBookingStatusInput = z.object({
  status: z.enum(['sample_collected', 'report_ready']),
});
export type UpdateBookingStatusInput = z.infer<typeof UpdateBookingStatusInput>;

// The narrower shape actually accepted by `PATCH /:id/status`. report_ready
// must never be settable directly through this route -- it can only be
// reached by uploading a report (POST /:id/report), which is what actually
// produces the reportUrl the "your report is ready" notification promises.
// Excluding it here means a request trying to set report_ready fails
// validation (400) before the handler is even reached.
export const PatchBookingStatusInput = z.object({
  status: z.literal('sample_collected'),
});
export type PatchBookingStatusInput = z.infer<typeof PatchBookingStatusInput>;
