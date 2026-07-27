import { z } from 'zod';

export const UserRole = z.enum(['patient', 'doctor', 'lab', 'admin']);
export type UserRole = z.infer<typeof UserRole>;

export const RegisterInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().min(10),
  role: UserRole,
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;
