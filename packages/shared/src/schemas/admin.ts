import { z } from 'zod';

export const VerificationDecisionInput = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    reason: z.string().min(1).optional(),
  })
  .refine((data) => data.decision !== 'rejected' || !!data.reason, {
    message: 'reason is required when rejecting',
    path: ['reason'],
  });
export type VerificationDecisionInput = z.infer<typeof VerificationDecisionInput>;
