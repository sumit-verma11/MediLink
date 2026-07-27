import bcrypt from 'bcryptjs';
import { RegisterInput, LoginInput } from '@medlink/shared';
import { User } from '../../models/User';
import { AppError } from '../../lib/errors';
import { signAccessToken, signRefreshToken } from './jwt';
import { getRedis } from '../../lib/redis';

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

function refreshKey(userId: string, jti: string): string {
  return `refresh:${userId}:${jti}`;
}

export async function register(input: RegisterInput) {
  const existing = await User.findOne({ email: input.email });
  if (existing) throw new AppError(409, 'Email already registered', 'EMAIL_TAKEN');

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await User.create({
    email: input.email,
    passwordHash,
    name: input.name,
    phone: input.phone,
    role: input.role,
  });
  return user;
}

export async function login(input: LoginInput) {
  const user = await User.findOne({ email: input.email });
  if (!user) throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');

  const access = signAccessToken(user._id.toString(), user.role);
  const refresh = signRefreshToken(user._id.toString());
  await getRedis().set(refreshKey(user._id.toString(), refresh.jti), '1', 'EX', REFRESH_TTL_SECONDS);

  return { user, accessToken: access.token, refreshToken: refresh.token };
}
