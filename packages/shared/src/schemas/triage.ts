import { z } from 'zod';

export const SendTriageMessageInput = z.object({
  text: z.string().min(1),
  sessionId: z.string().optional(),
});
export type SendTriageMessageInput = z.infer<typeof SendTriageMessageInput>;
