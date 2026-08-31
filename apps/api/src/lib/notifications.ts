import { Types } from 'mongoose';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { sendTelegramMessage } from './telegram';

export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  await Notification.create({
    userId: new Types.ObjectId(params.userId),
    type: params.type,
    title: params.title,
    body: params.body,
    link: params.link,
  });

  // Best-effort fan-out to Telegram, alongside the in-app Notification record this
  // function already writes. Never awaited by callers of createNotification (they
  // already don't await this function's downstream effects), and sendTelegramMessage
  // itself never throws.
  const user = await User.findById(params.userId).select('telegramChatId');
  if (user?.telegramChatId) {
    void sendTelegramMessage(user.telegramChatId, `${params.title}\n\n${params.body}`);
  }
}
