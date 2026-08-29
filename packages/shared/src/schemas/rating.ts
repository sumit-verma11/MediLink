import { z } from 'zod';

export const CreateRatingInput = z.object({
  appointmentId: z.string().min(1),
  score: z.number().int().min(1).max(5),
  text: z.string().max(1000).optional(),
});
export type CreateRatingInput = z.infer<typeof CreateRatingInput>;

export const CreateLabRatingInput = z.object({
  bookingId: z.string().min(1),
  score: z.number().int().min(1).max(5),
  text: z.string().max(1000).optional(),
});
export type CreateLabRatingInput = z.infer<typeof CreateLabRatingInput>;
