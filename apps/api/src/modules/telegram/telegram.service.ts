import { nanoid } from 'nanoid';
import { getRedis } from '../../lib/redis';
import { User } from '../../models/User';
import { sendTelegramMessage } from '../../lib/telegram';
import { AppError } from '../../lib/errors';

const LINK_CODE_TTL_SECONDS = 600;
const LINK_CODE_PREFIX = 'telegram:link:';

export async function generateLinkCode(userId: string): Promise<{ code: string; deepLink: string }> {
  const code = nanoid(8);
  await getRedis().set(`${LINK_CODE_PREFIX}${code}`, userId, 'EX', LINK_CODE_TTL_SECONDS);
  const username = process.env.TELEGRAM_BOT_USERNAME ?? 'medlink_bot';
  return { code, deepLink: `https://t.me/${username}?start=${code}` };
}

export async function handleStartCommand(code: string, chatId: string): Promise<void> {
  const redis = getRedis();
  const key = `${LINK_CODE_PREFIX}${code}`;
  const userId = await redis.get(key);
  if (!userId) {
    await sendTelegramMessage(chatId, 'This link code has expired. Generate a new one from your MedLink notifications page.');
    return;
  }
  await User.findByIdAndUpdate(userId, { telegramChatId: chatId });
  await redis.del(key);
  await sendTelegramMessage(chatId, 'Your MedLink account is now connected. You will get appointment, prescription, and lab updates here.');
}

export async function unlinkTelegram(userId: string): Promise<void> {
  const user = await User.findByIdAndUpdate(userId, { $unset: { telegramChatId: 1 } });
  if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
}
